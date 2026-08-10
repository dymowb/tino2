import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Divider,
  Stack,
  Grid,
  Card,
  CardContent,
  Chip,
  Rating,
  useTheme,
  alpha,
  Tooltip,
} from "@mui/material";
import {
  AutoAwesome,
  Schedule,
  LocationOn,
  Payment,
  Chat,
  Star,
  Cancel,
  CheckCircle,
  PlayArrow,
  Done,
  Refresh,
  AccessTime,
  ReceiptLong,
  Person,
  Replay,
  RequestQuote,
  Search,
} from "@mui/icons-material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import {
  apiService,
  Booking,
  Provider,
  QuoteRequest,
  Quote,
} from "../../services/api";
import { tokens } from "../../theme/theme";
import PageSkeleton from "../common/PageSkeleton";
import BookingDialog from "../bookings/BookingDialog";
import RequestCard from "../bookings/RequestCard";
import ReadinessDrawer from "../bookings/ReadinessDrawer";
import QuoteRequestDialog from "../quotes/QuoteRequestDialog";
import { quoteHighlights } from "../../utils/quoteComparison";

const STATUS_BORDER: Record<string, string> = {
  pending: tokens.color.gold,
  confirmed: tokens.color.earth,
  in_progress: tokens.color.earthLight,
  pending_completion: tokens.color.terra,
  completed: tokens.color.stone,
  in_dispute: tokens.color.terra,
  cancelled: tokens.color.stone,
};

const STATUS_BG: Record<string, string> = {
  pending: `${tokens.color.gold}14`,
  confirmed: `${tokens.color.earth}0D`,
  in_progress: `${tokens.color.earthLight}0D`,
  pending_completion: `${tokens.color.terra}0D`,
  completed: `${tokens.color.stone}0D`,
  in_dispute: `${tokens.color.terra}14`,
  cancelled: `${tokens.color.stone}0D`,
};

const STATUS_CHIP_COLOR: Record<string, { bg: string; text: string }> = {
  pending: { bg: `${tokens.color.gold}22`, text: tokens.color.gold },
  confirmed: { bg: `${tokens.color.earth}18`, text: tokens.color.earthLight },
  in_progress: {
    bg: `${tokens.color.earthLight}18`,
    text: tokens.color.earthLight,
  },
  pending_completion: {
    bg: `${tokens.color.terra}18`,
    text: tokens.color.terra,
  },
  completed: { bg: `${tokens.color.stone}18`, text: tokens.color.stone },
  in_dispute: { bg: `${tokens.color.terra}22`, text: tokens.color.terra },
  cancelled: { bg: `${tokens.color.stone}18`, text: tokens.color.stone },
};

const StatusChip: React.FC<{ status: Booking["status"]; label: string }> = ({
  status,
  label,
}) => {
  const colors = STATUS_CHIP_COLOR[status] || STATUS_CHIP_COLOR.cancelled;
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.6,
        px: 1.5,
        py: 0.5,
        borderRadius: tokens.radius.full,
        bgcolor: colors.bg,
        border: `1px solid ${colors.text}44`,
      }}
    >
      <Box
        sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: colors.text }}
      />
      <Typography
        sx={{
          fontFamily: tokens.font.body,
          fontSize: "0.75rem",
          fontWeight: 600,
          color: colors.text,
          lineHeight: 1,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
};

const ACTIVE_BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "in_progress",
  "pending_completion",
  "in_dispute",
];
const DONE_BOOKING_STATUSES = ["completed"];

// Mirrors ELIGIBLE_STATUSES in the backend snapshot service. `pending` is absent
// on purpose: nothing is actually agreed until the quote is accepted.
const READINESS_ELIGIBLE_STATUSES = [
  "confirmed",
  "in_progress",
  "pending_completion",
];

// A "job" in the unified hub:
//  - customer: an open request (awaiting/receiving quotes) or a booking
//  - provider: a submitted quote (awaiting customer / closed) or a booking
// Bookings are deduped against their origin request (requestId) / quote (quoteId).
const PROVIDER_DONE_QUOTE_STATUSES = ["rejected", "withdrawn", "expired"];
type Job =
  | { kind: "request"; ts: number; request: QuoteRequest; quotes: Quote[] }
  | { kind: "sentquote"; ts: number; quote: Quote }
  | { kind: "booking"; ts: number; booking: Booking };

const MyBookingsPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation(["bookings"]);
  const theme = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParamsURL] = useSearchParams();
  const highlightBookingId = searchParamsURL.get("bookingId");
  const highlightQuoteId = searchParamsURL.get("quoteId");

  const isProvider = user?.userType === "provider";
  const isDark = theme.palette.mode === "dark";

  // Both roles use the same lifecycle stages.
  const [stage, setStage] = useState<
    "all" | "awaiting" | "active" | "done" | "cancelled"
  >("all");
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(
    new Set(),
  );
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showDisputeDialog, setShowDisputeDialog] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [rebookProvider, setRebookProvider] = useState<Provider | null>(null);
  const [rebookServiceType, setRebookServiceType] = useState<string>("");
  const [rebookLocation, setRebookLocation] = useState<
    Booking["location"] | null
  >(null);
  const [rebookBookingId, setRebookBookingId] = useState<string | null>(null);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [compareQuotes, setCompareQuotes] = useState<Quote[] | null>(null);
  const [readinessBookingId, setReadinessBookingId] = useState<string | null>(
    null,
  );

  // ── Data ──────────────────────────────────────────────────────────────────
  const {
    data: bookingsData,
    isLoading: bookingsLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["bookings", "hub"],
    queryFn: () => apiService.getBookings({ limit: 100 }),
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });

  // Customer-only: their own requests. Quotes are role-scoped by the API
  // (customer → received quotes; provider → submitted quotes), so fetch for both.
  const { data: requestsData, isLoading: requestsLoading } = useQuery({
    queryKey: ["quote-requests"],
    queryFn: () => apiService.searchQuoteRequests(),
    enabled: isAuthenticated && !isProvider,
  });
  const { data: quotesData, isLoading: quotesLoading } = useQuery({
    queryKey: ["quotes"],
    queryFn: () => apiService.searchQuotes({ limit: 100 }),
    enabled: isAuthenticated,
  });

  const bookings: Booking[] = useMemo(
    () => (Array.isArray(bookingsData?.data) ? bookingsData!.data : []),
    [bookingsData],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateStatusMutation = useMutation({
    mutationFn: ({
      bookingId,
      status,
    }: {
      bookingId: string;
      status: string;
    }) => apiService.updateBookingStatus(bookingId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast.success(t("bookings:messages.status_updated_success"));
    },
    onError: (err: any) =>
      toast.error(
        err?.response?.data?.error ||
          t("bookings:messages.status_updated_error"),
      ),
  });

  const cancelBookingMutation = useMutation({
    mutationFn: ({
      bookingId,
      reason,
    }: {
      bookingId: string;
      reason?: string;
    }) => apiService.cancelBooking(bookingId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast.success(t("bookings:messages.cancelled_success"));
      setShowCancelDialog(false);
      setCancelReason("");
      setSelectedBooking(null);
    },
    onError: (err: any) =>
      toast.error(
        err?.response?.data?.error || t("bookings:messages.cancelled_error"),
      ),
  });

  const quoteStatusMutation = useMutation({
    mutationFn: ({
      quoteId,
      status,
      reason,
    }: {
      quoteId: string;
      status: "accepted" | "rejected" | "withdrawn";
      reason?: string;
    }) => apiService.updateQuoteStatus(quoteId, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["quote-requests"] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      setCompareQuotes(null);
      toast.success(t("bookings:messages.status_updated_success"));
    },
    onError: (err: any) =>
      toast.error(
        err?.response?.data?.error ||
          t("bookings:messages.status_updated_error"),
      ),
  });

  const closeRequestMutation = useMutation({
    mutationFn: ({
      requestId,
      reason,
    }: {
      requestId: string;
      reason?: string;
    }) => apiService.closeQuoteRequest(requestId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote-requests"] });
      toast.success(t("bookings:messages.status_updated_success"));
    },
    onError: (err: any) =>
      toast.error(
        err?.response?.data?.error ||
          t("bookings:messages.status_updated_error"),
      ),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleStatusUpdate = (
    bookingId: string,
    newStatus: Booking["status"],
  ) => updateStatusMutation.mutate({ bookingId, status: newStatus });

  const handleCancelBooking = () => {
    if (selectedBooking)
      cancelBookingMutation.mutate({
        bookingId: selectedBooking.id,
        reason: cancelReason,
      });
  };

  const bookingAction = async (
    id: string,
    action: () => Promise<any>,
    successMsg: string,
  ) => {
    setActionLoading((p) => ({ ...p, [id]: true }));
    try {
      await action();
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast.success(successMsg);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Action failed");
    } finally {
      setActionLoading((p) => ({ ...p, [id]: false }));
    }
  };

  const messageProviderFromQuote = async (quote: Quote) => {
    const providerUserId = quote.provider?.userId;
    if (!providerUserId) {
      navigate("/messages");
      return;
    }
    try {
      const conv = await apiService.createConversation({
        participantIds: [providerUserId],
        metadata: {
          quoteRequestId: quote.requestId,
          serviceType: quote.serviceType,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      navigate(`/messages?conversationId=${conv.id}`);
    } catch {
      navigate(`/messages?with=${providerUserId}`);
    }
  };

  const toggleRequest = (requestId: string) =>
    setExpandedRequests((prev) => {
      const next = new Set(prev);
      next.has(requestId) ? next.delete(requestId) : next.add(requestId);
      return next;
    });

  const formatDate = (s: string) =>
    new Date(s).toLocaleString("pt-BR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const formatCurrency = (amount: number | string) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(amount));

  // ── Build the unified customer job list (deduped: a booked request shows as a
  //    booking, not also as a request) ────────────────────────────────────────
  const jobs: Job[] = useMemo(() => {
    const quotes = Array.isArray(quotesData?.data) ? quotesData!.data : [];
    const out: Job[] = [];

    if (isProvider) {
      // Provider's own jobs: submitted quotes (accepted ones are deduped — shown as
      // the resulting booking via quoteId) + bookings.
      const bookedQuoteIds = new Set(
        bookings.map((b) => b.quoteId).filter(Boolean) as string[],
      );
      quotes.forEach((q) => {
        if (q.status === "accepted" || bookedQuoteIds.has(q.id)) return;
        out.push({
          kind: "sentquote",
          quote: q,
          ts: new Date(q.updatedAt || q.createdAt).getTime(),
        });
      });
    } else {
      // Customer's jobs: open requests (with nested quotes) + bookings, deduped.
      const requests = Array.isArray(requestsData?.data)
        ? requestsData!.data
        : [];
      const quotesByRequest = new Map<string, Quote[]>();
      quotes.forEach((q) => {
        const list = quotesByRequest.get(q.requestId) || [];
        list.push(q);
        quotesByRequest.set(q.requestId, list);
      });
      const bookedRequestIds = new Set(
        bookings.map((b) => b.requestId).filter(Boolean) as string[],
      );
      requests.forEach((r) => {
        if (bookedRequestIds.has(r.id)) return; // becomes a booking card
        if (r.status !== "open") return; // cancelled/closed w/o booking → drop
        out.push({
          kind: "request",
          request: r,
          quotes: quotesByRequest.get(r.id) || [],
          ts: new Date(r.updatedAt || r.createdAt).getTime(),
        });
      });
    }

    bookings.forEach((b) =>
      out.push({
        kind: "booking",
        booking: b,
        ts: new Date(b.updatedAt || b.createdAt).getTime(),
      }),
    );

    return out.sort((a, b) => b.ts - a.ts);
  }, [isProvider, requestsData, quotesData, bookings]);

  // A deep-linked quote (notification → /bookings?quoteId=) may already be ACCEPTED
  // by the time the customer clicks it — its request is then closed and rendered as
  // a booking, not a quote. Resolve that booking so we highlight/scroll it instead.
  const quoteBookingId = useMemo(() => {
    if (!highlightQuoteId) return null;
    return bookings.find((b) => b.quoteId === highlightQuoteId)?.id || null;
  }, [highlightQuoteId, bookings]);

  // Effective booking to highlight: explicit ?bookingId=, or the booking a
  // deep-linked (now-accepted) quote turned into.
  const effectiveBookingHighlight = highlightBookingId || quoteBookingId;

  // Auto-expand the request holding a still-pending deep-linked quote.
  React.useEffect(() => {
    if (!highlightQuoteId || quoteBookingId) return; // accepted → handled as a booking
    const quotes = Array.isArray(quotesData?.data) ? quotesData!.data : [];
    const q = quotes.find((x) => x.id === highlightQuoteId);
    if (q) setExpandedRequests((prev) => new Set(prev).add(q.requestId));
  }, [highlightQuoteId, quoteBookingId, quotesData]);

  // Robust scroll-into-view for the deep-link target. Runs on mount AND on in-app
  // navigation (query-param change) AND after the holding request expands — covers
  // the case where the user clicks a notification while already on this page.
  React.useEffect(() => {
    const selector = effectiveBookingHighlight
      ? `#booking-${effectiveBookingHighlight}`
      : highlightQuoteId
        ? `[data-quote-id="${highlightQuoteId}"]`
        : null;
    if (!selector) return;
    const tid = setTimeout(() => {
      document
        .querySelector(selector)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
    return () => clearTimeout(tid);
  }, [effectiveBookingHighlight, highlightQuoteId, expandedRequests, jobs]);

  // Stage classification, symmetric across roles:
  //  awaiting = open request (customer) / pending sent quote (provider)
  //  active   = booking in an active status
  //  done     = completed booking only
  //  cancelled = cancelled booking only
  const jobStage = (
    j: Job,
  ): "awaiting" | "active" | "done" | "cancelled" | null => {
    if (j.kind === "request") return "awaiting";
    if (j.kind === "sentquote")
      return j.quote.status === "pending" ? "awaiting" : null;
    if (ACTIVE_BOOKING_STATUSES.includes(j.booking.status)) return "active";
    if (DONE_BOOKING_STATUSES.includes(j.booking.status)) return "done";
    if (j.booking.status === "cancelled") return "cancelled";
    return null;
  };

  const stageCount = useMemo(() => {
    const c = {
      all: jobs.length,
      awaiting: 0,
      active: 0,
      done: 0,
      cancelled: 0,
    };
    jobs.forEach((j) => {
      const s = jobStage(j);
      if (s) c[s]++;
    });
    return c;
  }, [jobs]);

  const visibleJobs = useMemo(
    () => (stage === "all" ? jobs : jobs.filter((j) => jobStage(j) === stage)),
    [jobs, stage],
  );

  const isLoading = bookingsLoading || requestsLoading || quotesLoading;

  // ── Booking card (shared by both roles) ─────────────────────────────────────
  const renderBookingCard = (booking: Booking, index: number) => {
    const borderColor = STATUS_BORDER[booking.status] || tokens.color.stone;
    const bgColor = STATUS_BG[booking.status] || "transparent";
    return (
      <motion.div
        key={booking.id}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{
          duration: 0.3,
          delay: index * 0.04,
          ease: [0.16, 1, 0.3, 1],
        }}
      >
        <Box
          id={`booking-${booking.id}`}
          sx={{
            borderRadius: tokens.radius.lg,
            border: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
            bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper,
            overflow: "hidden",
            borderLeft: `4px solid ${effectiveBookingHighlight === booking.id ? tokens.color.gold : borderColor}`,
            transition: "box-shadow 0.2s ease",
            outline:
              effectiveBookingHighlight === booking.id
                ? `2px solid ${tokens.color.gold}`
                : "none",
            "&:hover": { boxShadow: `0 4px 24px ${alpha(borderColor, 0.15)}` },
          }}
        >
          {/* Card header */}
          <Box
            sx={{
              px: 3,
              pt: 2.5,
              pb: 2,
              bgcolor: isDark ? alpha(bgColor, 0.5) : bgColor,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: 1,
            }}
          >
            <Box>
              <Typography
                sx={{
                  fontFamily: tokens.font.display,
                  fontSize: "1.125rem",
                  fontWeight: 500,
                  color: "text.primary",
                  mb: 0.25,
                }}
              >
                {booking.serviceType
                  .replace(/_/g, " ")
                  .replace(/(^|\s)(\S)/g, (_, s, c) => s + c.toUpperCase())}
              </Typography>
              <Typography
                sx={{
                  fontFamily: tokens.font.mono,
                  fontSize: "0.7rem",
                  color: "text.disabled",
                }}
              >
                #{booking.id.substring(0, 8).toUpperCase()}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Typography
                sx={{
                  fontFamily: tokens.font.mono,
                  fontSize: "1rem",
                  fontWeight: 600,
                  color:
                    booking.status === "pending"
                      ? tokens.color.terra
                      : "text.primary",
                }}
              >
                {formatCurrency(booking.totalAmount)}
              </Typography>
              <StatusChip
                status={booking.status}
                label={t(`bookings:status.${booking.status}`)}
              />
            </Box>
          </Box>

          <Divider sx={{ opacity: 0.5 }} />

          {/* Details row */}
          <Box sx={{ px: 3, py: 2, display: "flex", flexWrap: "wrap", gap: 3 }}>
            {(isProvider
              ? booking.customer?.firstName
              : booking.provider?.businessName) && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Person sx={{ fontSize: 15, color: "text.disabled" }} />
                <Typography variant="body2" color="text.secondary">
                  {isProvider
                    ? `${booking.customer?.firstName || ""} ${booking.customer?.lastName || ""}`.trim()
                    : booking.provider?.businessName}
                </Typography>
              </Box>
            )}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Schedule sx={{ fontSize: 15, color: "text.disabled" }} />
              <Typography variant="body2" color="text.secondary">
                {formatDate(booking.scheduledDate)}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <LocationOn sx={{ fontSize: 15, color: "text.disabled" }} />
              <Typography variant="body2" color="text.secondary">
                {booking.location.address}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <AccessTime sx={{ fontSize: 15, color: "text.disabled" }} />
              <Typography variant="body2" color="text.secondary">
                {booking.estimatedDuration % 60 === 0
                  ? `${booking.estimatedDuration / 60}h`
                  : `${(booking.estimatedDuration / 60).toFixed(1)}h`}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Payment sx={{ fontSize: 15, color: "text.disabled" }} />
              <Typography variant="body2" color="text.secondary">
                {booking.status === "cancelled" &&
                booking.paymentStatus === "pending"
                  ? t("bookings:payment_status.not_charged")
                  : t(
                      `common:payment_status.${booking.paymentStatus}`,
                      booking.paymentStatus,
                    )}
              </Typography>
            </Box>
          </Box>

          {booking.description && (
            <Box sx={{ px: 3, pb: 1.5 }}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  borderLeft: `2px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
                  pl: 1.5,
                  fontStyle: "italic",
                }}
              >
                {booking.description}
              </Typography>
            </Box>
          )}

          {/* Actions */}
          <Box
            sx={{
              px: 3,
              pb: 2.5,
              pt: 1,
              display: "flex",
              gap: 1,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {READINESS_ELIGIBLE_STATUSES.includes(booking.status) && (
              <Tooltip title={t("bookings:readiness.prepare_tooltip")}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AutoAwesome fontSize="small" />}
                  onClick={() => setReadinessBookingId(booking.id)}
                  data-testid="readiness-open"
                  data-booking-id={booking.id}
                  sx={{
                    borderColor: tokens.color.gold,
                    color: tokens.color.gold,
                    borderRadius: tokens.radius.full,
                    px: 2.5,
                    "&:hover": {
                      borderColor: tokens.color.gold,
                      bgcolor: alpha(tokens.color.gold, 0.08),
                    },
                  }}
                >
                  {t("bookings:readiness.prepare")}
                </Button>
              </Tooltip>
            )}

            {booking.status === "pending" && isProvider && (
              <>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<CheckCircle fontSize="small" />}
                  onClick={() => handleStatusUpdate(booking.id, "confirmed")}
                  disabled={updateStatusMutation.isPending}
                  sx={{
                    bgcolor: tokens.color.earth,
                    "&:hover": { bgcolor: tokens.color.earthLight },
                    borderRadius: tokens.radius.full,
                    px: 2.5,
                  }}
                >
                  {t("bookings:actions.accept")}
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Cancel fontSize="small" />}
                  onClick={() => {
                    setSelectedBooking(booking);
                    setShowCancelDialog(true);
                  }}
                  disabled={updateStatusMutation.isPending}
                  sx={{
                    borderColor: tokens.color.terra,
                    color: tokens.color.terra,
                    "&:hover": {
                      bgcolor: `${tokens.color.terra}0D`,
                      borderColor: tokens.color.terraDark,
                    },
                    borderRadius: tokens.radius.full,
                    px: 2.5,
                  }}
                >
                  {t("bookings:actions.decline")}
                </Button>
              </>
            )}

            {booking.status === "confirmed" && isProvider && (
              <Button
                variant="contained"
                size="small"
                startIcon={
                  actionLoading[booking.id] ? (
                    <CircularProgress size={14} />
                  ) : (
                    <PlayArrow fontSize="small" />
                  )
                }
                onClick={() =>
                  bookingAction(
                    booking.id,
                    () => apiService.startBooking(booking.id),
                    t("bookings:messages.service_started"),
                  )
                }
                disabled={actionLoading[booking.id]}
                sx={{
                  bgcolor: tokens.color.terra,
                  "&:hover": { bgcolor: tokens.color.terraDark },
                  borderRadius: tokens.radius.full,
                  px: 2.5,
                }}
              >
                {t("bookings:actions.start_service")}
              </Button>
            )}

            {booking.status === "in_progress" && isProvider && (
              <Button
                variant="contained"
                size="small"
                startIcon={
                  actionLoading[booking.id] ? (
                    <CircularProgress size={14} />
                  ) : (
                    <Done fontSize="small" />
                  )
                }
                onClick={() =>
                  bookingAction(
                    booking.id,
                    () => apiService.markBookingComplete(booking.id),
                    t("bookings:messages.marked_complete"),
                  )
                }
                disabled={actionLoading[booking.id]}
                sx={{
                  bgcolor: tokens.color.earth,
                  "&:hover": { bgcolor: tokens.color.earthLight },
                  borderRadius: tokens.radius.full,
                  px: 2.5,
                }}
              >
                {t("bookings:actions.mark_complete")}
              </Button>
            )}

            {booking.status === "pending_completion" && !isProvider && (
              <>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={
                    actionLoading[booking.id] ? (
                      <CircularProgress size={14} />
                    ) : (
                      <CheckCircle fontSize="small" />
                    )
                  }
                  onClick={() =>
                    bookingAction(
                      booking.id,
                      () => apiService.confirmBookingCompletion(booking.id),
                      t("bookings:messages.completion_confirmed"),
                    )
                  }
                  disabled={actionLoading[booking.id]}
                  sx={{
                    bgcolor: tokens.color.earth,
                    "&:hover": { bgcolor: tokens.color.earthLight },
                    borderRadius: tokens.radius.full,
                    px: 2.5,
                  }}
                >
                  {t("bookings:actions.confirm_completion")}
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Cancel fontSize="small" />}
                  onClick={() => {
                    setSelectedBooking(booking);
                    setShowDisputeDialog(true);
                  }}
                  disabled={actionLoading[booking.id]}
                  sx={{
                    borderColor: tokens.color.terra,
                    color: tokens.color.terra,
                    borderRadius: tokens.radius.full,
                    px: 2.5,
                  }}
                >
                  {t("bookings:actions.open_dispute")}
                </Button>
              </>
            )}

            {booking.status === "completed" &&
              !isProvider &&
              (booking.reviews && booking.reviews.length > 0 ? (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<CheckCircle fontSize="small" />}
                  disabled
                  sx={{
                    borderColor: tokens.color.stone,
                    color: tokens.color.stone,
                    borderRadius: tokens.radius.full,
                    px: 2.5,
                  }}
                >
                  {t("bookings:actions.review_sent")}
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Star fontSize="small" />}
                  onClick={() =>
                    toast(t("bookings:messages.review_coming_soon"))
                  }
                  sx={{
                    borderColor: tokens.color.gold,
                    color: tokens.color.gold,
                    "&:hover": {
                      bgcolor: `${tokens.color.gold}0D`,
                      borderColor: tokens.color.gold,
                    },
                    borderRadius: tokens.radius.full,
                    px: 2.5,
                  }}
                >
                  {t("bookings:actions.leave_review")}
                </Button>
              ))}

            {booking.status === "completed" &&
              !isProvider &&
              booking.provider && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Replay fontSize="small" />}
                  onClick={() => {
                    setRebookProvider(booking.provider as Provider);
                    setRebookServiceType(booking.serviceType);
                    setRebookLocation(booking.location);
                    setRebookBookingId(booking.id);
                  }}
                  sx={{
                    borderColor: tokens.color.earth,
                    color: tokens.color.earth,
                    "&:hover": { bgcolor: `${tokens.color.earth}0D` },
                    borderRadius: tokens.radius.full,
                    px: 2.5,
                  }}
                >
                  {t("bookings:actions.rebook")}
                </Button>
              )}

            {booking.status === "cancelled" && !isProvider && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<Search fontSize="small" />}
                onClick={() =>
                  navigate(
                    `/providers?service=${encodeURIComponent(booking.serviceType)}`,
                  )
                }
                sx={{ borderRadius: tokens.radius.full, px: 2.5 }}
              >
                {t("bookings:actions.find_similar")}
              </Button>
            )}

            {(booking.status === "pending" || booking.status === "confirmed") &&
              !isProvider && (
                <Button
                  variant="text"
                  size="small"
                  startIcon={<Cancel fontSize="small" />}
                  onClick={() => {
                    setSelectedBooking(booking);
                    setShowCancelDialog(true);
                  }}
                  disabled={updateStatusMutation.isPending}
                  sx={{
                    color: "text.disabled",
                    borderRadius: tokens.radius.full,
                  }}
                >
                  {t("bookings:actions.cancel")}
                </Button>
              )}

            <Box sx={{ flex: 1 }} />

            {!["completed", "cancelled"].includes(booking.status) && (
              <Button
                variant="text"
                size="small"
                startIcon={<Chat fontSize="small" />}
                onClick={async () => {
                  const otherUserId = isProvider
                    ? booking.customer?.id
                    : booking.provider?.userId;
                  if (!otherUserId) {
                    navigate("/messages");
                    return;
                  }
                  try {
                    const conv = await apiService.createConversation({
                      participantIds: [otherUserId],
                      metadata: {
                        bookingId: booking.id,
                        serviceType: booking.serviceType,
                      },
                    });
                    queryClient.invalidateQueries({
                      queryKey: ["conversations"],
                    });
                    navigate(`/messages?conversationId=${conv.id}`);
                  } catch {
                    navigate(`/messages?with=${otherUserId}`);
                  }
                }}
                sx={{
                  color: "text.secondary",
                  borderRadius: tokens.radius.full,
                }}
              >
                {t("bookings:actions.message")}
              </Button>
            )}
          </Box>
        </Box>
      </motion.div>
    );
  };

  // ── Provider's submitted-quote card (awaiting customer / closed) ────────────
  const QUOTE_CHIP: Record<string, string> = {
    pending: tokens.color.gold,
    accepted: tokens.color.earth,
    rejected: tokens.color.terra,
    withdrawn: tokens.color.stone,
    expired: tokens.color.stone,
  };
  const renderSentQuoteCard = (quote: Quote, index: number) => {
    const chip = QUOTE_CHIP[quote.status] || tokens.color.stone;
    const req = quote.request as QuoteRequest | undefined;
    const isDirect =
      Array.isArray(req?.targetProviderIds) &&
      (req!.targetProviderIds as string[]).length > 0;
    const customerName =
      `${quote.customer?.firstName || ""} ${quote.customer?.lastName || ""}`.trim();
    return (
      <motion.div
        key={`sq-${quote.id}`}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{
          duration: 0.3,
          delay: index * 0.04,
          ease: [0.16, 1, 0.3, 1],
        }}
      >
        <Box
          data-quote-id={quote.id}
          sx={{
            borderRadius: tokens.radius.lg,
            border: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
            bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper,
            overflow: "hidden",
            borderLeft: `4px solid ${chip}`,
            outline:
              highlightQuoteId === quote.id
                ? `2px solid ${tokens.color.gold}`
                : "none",
          }}
        >
          <Box
            sx={{
              px: 3,
              pt: 2.5,
              pb: 2,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: 1,
            }}
          >
            <Box>
              <Typography
                sx={{
                  fontFamily: tokens.font.display,
                  fontSize: "1.125rem",
                  fontWeight: 500,
                  color: "text.primary",
                  mb: 0.25,
                }}
              >
                {quote.serviceType
                  .replace(/_/g, " ")
                  .replace(/(^|\s)(\S)/g, (_, s, c) => s + c.toUpperCase())}
              </Typography>
              <Typography
                sx={{
                  fontFamily: tokens.font.mono,
                  fontSize: "0.7rem",
                  color: "text.disabled",
                }}
              >
                {isDirect
                  ? t("bookings:hub.direct_badge")
                  : t("bookings:hub.open_badge")}{" "}
                · #{quote.id.substring(0, 8).toUpperCase()}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Typography
                sx={{
                  fontFamily: tokens.font.mono,
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: tokens.color.terra,
                }}
              >
                {formatCurrency(quote.estimatedPrice)}
              </Typography>
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.6,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: tokens.radius.full,
                  bgcolor: `${chip}1F`,
                  border: `1px solid ${chip}44`,
                }}
              >
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: chip,
                  }}
                />
                <Typography
                  sx={{
                    fontFamily: tokens.font.body,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: chip,
                    lineHeight: 1,
                  }}
                >
                  {quote.status === "pending"
                    ? t("bookings:hub.awaiting_response")
                    : t(`bookings:hub.qstatus.${quote.status}`, quote.status)}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Divider sx={{ opacity: 0.5 }} />

          <Box sx={{ px: 3, py: 2, display: "flex", flexWrap: "wrap", gap: 3 }}>
            {customerName && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Person sx={{ fontSize: 15, color: "text.disabled" }} />
                <Typography variant="body2" color="text.secondary">
                  {customerName}
                </Typography>
              </Box>
            )}
            {req?.location?.city && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <LocationOn sx={{ fontSize: 15, color: "text.disabled" }} />
                <Typography variant="body2" color="text.secondary">
                  {req.location.city}
                </Typography>
              </Box>
            )}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Schedule sx={{ fontSize: 15, color: "text.disabled" }} />
              <Typography variant="body2" color="text.secondary">
                {t("bookings:hub.valid_until", {
                  date: new Date(quote.validUntil).toLocaleDateString("pt-BR"),
                })}
              </Typography>
            </Box>
          </Box>

          {quote.description && (
            <Box sx={{ px: 3, pb: 1.5 }}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  borderLeft: `2px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
                  pl: 1.5,
                  fontStyle: "italic",
                }}
              >
                {quote.description}
              </Typography>
            </Box>
          )}

          <Box
            sx={{
              px: 3,
              pb: 2.5,
              pt: 1,
              display: "flex",
              gap: 1,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {quote.status === "pending" && (
              <Typography
                variant="body2"
                color="text.disabled"
                sx={{ fontStyle: "italic" }}
              >
                {t("bookings:hub.awaiting_customer")}
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            {quote.status === "pending" && (
              <Button
                variant="text"
                size="small"
                startIcon={<Cancel fontSize="small" />}
                onClick={() =>
                  quoteStatusMutation.mutate({
                    quoteId: quote.id,
                    status: "withdrawn",
                    reason: "Provider withdrew quote",
                  })
                }
                disabled={quoteStatusMutation.isPending}
                sx={{
                  color: "text.disabled",
                  borderRadius: tokens.radius.full,
                }}
              >
                {t("bookings:hub.withdraw")}
              </Button>
            )}
          </Box>
        </Box>
      </motion.div>
    );
  };

  if (!isAuthenticated) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="h6">
          {t("bookings:list.login_required")}
        </Typography>
      </Box>
    );
  }

  const stageOptions: Array<{
    value: typeof stage;
    label: string;
    count: number;
  }> = [
    {
      value: "all",
      label: t("bookings:hub.filter.all"),
      count: stageCount.all,
    },
    {
      value: "awaiting",
      label: isProvider
        ? t("bookings:hub.filter.awaiting_provider")
        : t("bookings:hub.filter.awaiting"),
      count: stageCount.awaiting,
    },
    {
      value: "active",
      label: t("bookings:hub.filter.active"),
      count: stageCount.active,
    },
    {
      value: "done",
      label: t("bookings:hub.filter.done"),
      count: stageCount.done,
    },
    {
      value: "cancelled",
      label: t("bookings:hub.filter.cancelled"),
      count: stageCount.cancelled,
    },
  ];

  const chipSx = (selected: boolean) => ({
    px: 2,
    py: 0.75,
    borderRadius: tokens.radius.full,
    cursor: "pointer",
    fontSize: "0.8125rem",
    fontWeight: 500,
    fontFamily: tokens.font.body,
    border: "1px solid",
    transition: "all 0.15s ease",
    ...(selected
      ? {
          bgcolor: tokens.color.earth,
          borderColor: tokens.color.earth,
          color: "#fff",
        }
      : {
          bgcolor: "transparent",
          borderColor: isDark
            ? tokens.color.nightBorder
            : tokens.color.paperDark,
          color: "text.secondary",
          "&:hover": {
            borderColor: tokens.color.earth,
            color: tokens.color.earth,
          },
        }),
  });

  const emptyLabel =
    stage === "awaiting"
      ? t("bookings:hub.empty_awaiting")
      : stage === "active"
        ? t("bookings:hub.empty_active")
        : stage === "done"
          ? t("bookings:hub.empty_done")
          : stage === "cancelled"
            ? t("bookings:hub.empty_cancelled")
            : t("bookings:hub.empty_all");

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 4, maxWidth: 900, mx: "auto" }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          mb: 4,
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box>
          <Typography
            sx={{
              fontFamily: tokens.font.display,
              fontSize: { xs: "1.75rem", md: "2.25rem" },
              fontWeight: 500,
              lineHeight: 1.1,
              color: "text.primary",
            }}
          >
            {t("bookings:list.title")}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          {!isProvider && (
            <Button
              startIcon={<RequestQuote fontSize="small" />}
              onClick={() => setShowNewRequest(true)}
              variant="contained"
              sx={{
                bgcolor: tokens.color.earth,
                "&:hover": { bgcolor: tokens.color.earthLight },
                borderRadius: tokens.radius.full,
                px: 2.5,
              }}
            >
              {t("bookings:hub.new_request")}
            </Button>
          )}
          <Button
            startIcon={<Refresh fontSize="small" />}
            onClick={() => refetch()}
            variant="outlined"
            size="small"
            disabled={isLoading}
            sx={{ borderRadius: tokens.radius.full, px: 2 }}
          >
            {t("bookings:list.refresh")}
          </Button>
        </Box>
      </Box>

      {/* Lifecycle filters (same stages for both roles) */}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 4 }}>
        {stageOptions.map((opt) => (
          <Box
            key={opt.value}
            onClick={() => setStage(opt.value)}
            sx={chipSx(stage === opt.value)}
          >
            {opt.label}
            {opt.count > 0 ? ` (${opt.count})` : ""}
          </Box>
        ))}
      </Box>

      {isLoading && <PageSkeleton variant="list" />}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {t("bookings:list.error_loading")}
        </Alert>
      )}

      {/* Unified hub — one list of lifecycle cards for both roles */}
      {!isLoading &&
        !error &&
        (visibleJobs.length === 0 ? (
          <EmptyState
            isDark={isDark}
            label={emptyLabel}
            hint={
              stage === "all" && !isProvider
                ? t("bookings:list.start_booking_prompt")
                : undefined
            }
          />
        ) : (
          <AnimatePresence>
            <Stack spacing={2}>
              {visibleJobs.map((job, i) => {
                if (job.kind === "booking")
                  return renderBookingCard(job.booking, i);
                if (job.kind === "sentquote")
                  return renderSentQuoteCard(job.quote, i);
                return (
                  <motion.div
                    key={`req-${job.request.id}`}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{
                      duration: 0.3,
                      delay: i * 0.04,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    <RequestCard
                      request={job.request}
                      quotes={job.quotes}
                      expanded={expandedRequests.has(job.request.id)}
                      onToggle={() => toggleRequest(job.request.id)}
                      onAcceptQuote={(q) =>
                        quoteStatusMutation.mutate({
                          quoteId: q.id,
                          status: "accepted",
                        })
                      }
                      onRejectQuote={(q) =>
                        quoteStatusMutation.mutate({
                          quoteId: q.id,
                          status: "rejected",
                          reason: "Customer chose another provider",
                        })
                      }
                      onMessageProvider={messageProviderFromQuote}
                      onCloseRequest={(r) =>
                        closeRequestMutation.mutate({
                          requestId: r.id,
                          reason: "Customer cancelled",
                        })
                      }
                      onCompare={(qs) => setCompareQuotes(qs)}
                      acceptPending={quoteStatusMutation.isPending}
                      highlightQuoteId={highlightQuoteId}
                    />
                  </motion.div>
                );
              })}
            </Stack>
          </AnimatePresence>
        ))}

      {/* Cancel Dialog */}
      <Dialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontFamily: tokens.font.display, fontWeight: 500 }}>
          {t("bookings:cancel.title")}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {t("bookings:cancel.confirm")}
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            label={t("bookings:cancel.reason")}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            variant="outlined"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button
            onClick={() => setShowCancelDialog(false)}
            sx={{ borderRadius: tokens.radius.full }}
          >
            {t("bookings:actions.keep_booking")}
          </Button>
          <Button
            onClick={handleCancelBooking}
            variant="contained"
            disabled={cancelBookingMutation.isPending}
            sx={{
              bgcolor: tokens.color.terra,
              "&:hover": { bgcolor: tokens.color.terraDark },
              borderRadius: tokens.radius.full,
            }}
          >
            {cancelBookingMutation.isPending
              ? t("bookings:actions.cancelling")
              : t("bookings:actions.cancel_booking")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Re-book / direct request dialog */}
      <BookingDialog
        open={!!rebookProvider}
        onClose={() => {
          setRebookProvider(null);
          setRebookServiceType("");
          setRebookLocation(null);
          setRebookBookingId(null);
        }}
        provider={rebookProvider}
        serviceType={rebookServiceType}
        initialLocation={rebookLocation}
        rebookBookingId={rebookBookingId}
      />

      {/* New broadcast request */}
      <QuoteRequestDialog
        open={showNewRequest}
        onClose={() => setShowNewRequest(false)}
      />

      <ReadinessDrawer
        bookingId={readinessBookingId}
        open={Boolean(readinessBookingId)}
        onClose={() => setReadinessBookingId(null)}
      />

      {/* Dispute Dialog */}
      <Dialog
        open={showDisputeDialog}
        onClose={() => setShowDisputeDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontFamily: tokens.font.display, fontWeight: 500 }}>
          {t("bookings:dispute.title")}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t("bookings:dispute.description")}
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            label={t("bookings:dispute.reason_label")}
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            variant="outlined"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button
            onClick={() => setShowDisputeDialog(false)}
            sx={{ borderRadius: tokens.radius.full }}
          >
            {t("bookings:dispute.cancel")}
          </Button>
          <Button
            onClick={() => {
              if (selectedBooking) {
                bookingAction(
                  selectedBooking.id,
                  () =>
                    apiService.disputeBooking(
                      selectedBooking.id,
                      disputeReason,
                    ),
                  t("bookings:dispute.success"),
                );
                setShowDisputeDialog(false);
                setDisputeReason("");
              }
            }}
            variant="contained"
            disabled={
              !disputeReason.trim() || actionLoading[selectedBooking?.id || ""]
            }
            sx={{
              bgcolor: tokens.color.terra,
              "&:hover": { bgcolor: tokens.color.terraDark },
              borderRadius: tokens.radius.full,
            }}
          >
            {t("bookings:dispute.submit")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Compare quotes */}
      <Dialog
        open={!!compareQuotes}
        onClose={() => setCompareQuotes(null)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle sx={{ fontFamily: tokens.font.display, fontWeight: 500 }}>
          {t("bookings:hub.compare")}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {(compareQuotes || []).map((quote) => (
              <Grid item xs={12} md={4} key={quote.id}>
                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: tokens.radius.md,
                    borderColor: quoteHighlights(compareQuotes || [])
                      .get(quote.id)
                      ?.includes("bestValue")
                      ? tokens.color.gold
                      : undefined,
                  }}
                >
                  <CardContent>
                    <Stack
                      direction="row"
                      spacing={0.75}
                      useFlexGap
                      flexWrap="wrap"
                      sx={{ mb: 1 }}
                    >
                      {(
                        quoteHighlights(compareQuotes || []).get(quote.id) || []
                      ).map((highlight) => (
                        <Chip
                          key={highlight}
                          size="small"
                          color={
                            highlight === "bestValue" ? "primary" : "default"
                          }
                          label={t(`bookings:hub.${highlight}`)}
                        />
                      ))}
                    </Stack>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                      {quote.provider?.businessName || "—"}
                    </Typography>
                    <Typography
                      variant="h4"
                      color="primary"
                      sx={{ mb: 1, fontFamily: tokens.font.mono }}
                    >
                      {formatCurrency(quote.estimatedPrice)}
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      {(quote.estimatedDuration / 60).toFixed(1)}h
                    </Typography>
                    {quote.provider && (
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          mb: 1.5,
                        }}
                      >
                        <Rating
                          value={Number(quote.provider.rating) || 0}
                          readOnly
                          size="small"
                        />
                        <Typography variant="caption">
                          ({quote.provider.totalReviews})
                        </Typography>
                      </Box>
                    )}
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 2 }}
                    >
                      {quote.description}
                    </Typography>
                    {quote.status === "pending" && (
                      <Box sx={{ display: "flex", gap: 1 }}>
                        <Button
                          size="small"
                          variant="contained"
                          fullWidth
                          disabled={quoteStatusMutation.isPending}
                          onClick={() =>
                            quoteStatusMutation.mutate({
                              quoteId: quote.id,
                              status: "accepted",
                            })
                          }
                          sx={{
                            bgcolor: tokens.color.earth,
                            "&:hover": { bgcolor: tokens.color.earthLight },
                            borderRadius: tokens.radius.full,
                          }}
                        >
                          {t("bookings:hub.accept")}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          fullWidth
                          disabled={quoteStatusMutation.isPending}
                          onClick={() =>
                            quoteStatusMutation.mutate({
                              quoteId: quote.id,
                              status: "rejected",
                              reason: "Customer chose another provider",
                            })
                          }
                          sx={{ borderRadius: tokens.radius.full }}
                        >
                          {t("bookings:hub.reject")}
                        </Button>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompareQuotes(null)}>
            {t("bookings:dispute.cancel")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const EmptyState: React.FC<{
  isDark: boolean;
  label: string;
  hint?: string;
}> = ({ isDark, label, hint }) => (
  <Box
    sx={{
      py: 8,
      textAlign: "center",
      border: `1px dashed ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
      borderRadius: tokens.radius.lg,
    }}
  >
    <ReceiptLong sx={{ fontSize: 48, color: "text.disabled", mb: 2 }} />
    <Typography variant="body1" color="text.secondary">
      {label}
    </Typography>
    {hint && (
      <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
        {hint}
      </Typography>
    )}
  </Box>
);

export default MyBookingsPage;
