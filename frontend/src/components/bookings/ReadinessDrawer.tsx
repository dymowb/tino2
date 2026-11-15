import React from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { tokens } from "../../theme/theme";
import apiService, {
  ReadinessFinding,
  ReadinessPlan,
  ReadinessRunResponse,
} from "../../services/api";

interface Props {
  bookingId: string | null;
  open: boolean;
  onClose: () => void;
  /**
   * Takes a drafted message to the composer. Supplied by the page, which knows
   * the booking and therefore who the other participant is; without it the
   * "Draft a message" action is not offered.
   */
  onDraftReady?: (bookingId: string, body: string) => void;
}

const SEVERITY_ORDER: Record<ReadinessFinding["severity"], number> = {
  blocking: 0,
  attention: 1,
  info: 2,
};

const SEVERITY_COLOR: Record<ReadinessFinding["severity"], string> = {
  blocking: tokens.color.terra,
  attention: tokens.color.gold,
  info: tokens.color.earthLight,
};

const READINESS_ICON = {
  ready: CheckCircleIcon,
  needs_attention: WarningAmberIcon,
  blocked: ErrorOutlineIcon,
  incomplete: InfoOutlinedIcon,
} as const;

/**
 * The server's own explanation when a run was refused for cost, or null for any
 * other failure. The message is localized server-side and names which ceiling
 * was hit, which the client cannot work out for itself.
 */
type DraftRequest = { bookingId: string; runId: string; findingId: string };

/**
 * The server's explanation when a draft was refused for a reason the user can
 * act on — out of budget (429) or a plan that went stale (409) — rather than
 * a failure worth retrying.
 */
export function draftRefusal(error: unknown): string | null {
  const response = (
    error as { response?: { status?: number; data?: { message?: string } } }
  )?.response;
  if (response?.status !== 429 && response?.status !== 409) return null;
  return response.data?.message ?? null;
}

export function budgetRefusal(error: unknown): string | null {
  const response = (
    error as { response?: { status?: number; data?: { message?: string } } }
  )?.response;
  if (response?.status !== 429) return null;
  return response.data?.message ?? null;
}

/**
 * Advisory panel. Everything here is read-only by design: the Copilot explains
 * and asks, it never changes a booking. Platform facts, AI findings, and the
 * verification summary are visually distinct so a reader can tell which is which.
 */
export const ReadinessDrawer: React.FC<Props> = ({
  bookingId,
  open,
  onClose,
  onDraftReady,
}) => {
  const { t } = useTranslation("bookings");
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ReadinessRunResponse | null>({
    queryKey: ["readiness", bookingId],
    queryFn: () => apiService.getLatestReadinessRun(bookingId!),
    enabled: open && Boolean(bookingId),
  });

  // What the drawer is showing *now*. A mutation outlives the booking it was
  // started for: one drawer serves every booking on the page, so the user can
  // close it, or switch to another booking, while a call is still in flight.
  // A result must land against the booking it was requested for, never against
  // whichever one happens to be open when it arrives.
  const current = React.useRef({ bookingId, open });
  current.current = { bookingId, open };

  // One draft at a time, for the finding the user asked about. Written on
  // request rather than for every finding on every run: most findings are read
  // once and dismissed, and drafting eagerly would add a serial stage to a
  // workflow whose other agents run in parallel.
  const draftMutation = useMutation({
    mutationFn: (vars: DraftRequest) =>
      apiService.draftReadinessMessage(vars.runId, vars.findingId),
    onSuccess: (draft, vars) => {
      // A draft about one booking must never be staged in another booking's
      // conversation, and a drawer the user has since closed has given up on
      // it: navigating away seconds later, unasked, would be inexplicable.
      if (
        !current.current.open ||
        current.current.bookingId !== vars.bookingId
      ) {
        return;
      }

      // Handed to the real composer, not sent. The user edits it there and
      // sends it themselves, through the messaging API — no agent endpoint
      // acquires a write capability.
      //
      // The page opens the conversation, because finding-or-creating one needs
      // to know who the other participant is, and that belongs with the booking.
      onClose();
      onDraftReady?.(vars.bookingId, draft.body);
    },
  });

  // Which bookings have a run in flight. A mutation's `variables` name only the
  // latest call, so after A → run B → back to A it would report A idle and
  // re-enable a button the server refuses (one in-flight run per booking).
  const [runsInFlight, setRunsInFlight] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const markRun = (id: string, inFlight: boolean) =>
    setRunsInFlight((prev) => {
      const next = new Set(prev);
      if (inFlight) next.add(id);
      else next.delete(id);
      return next;
    });

  const runMutation = useMutation({
    mutationFn: (forBookingId: string) =>
      apiService.createReadinessRun(forBookingId),
    onMutate: (forBookingId) => markRun(forBookingId, true),
    onSettled: (_result, _error, forBookingId) =>
      markRun(forBookingId, false),
    onSuccess: (result, forBookingId) => {
      // Keyed by the booking the run was for, not the one now open.
      queryClient.setQueryData(["readiness", forBookingId], result);
    },
  });

  // A draft error describes one booking's call; carried over, it would describe
  // the next booking wrongly.
  const { reset: resetDraft } = draftMutation;
  React.useEffect(() => {
    resetDraft();
  }, [bookingId, resetDraft]);

  // Errors and "reused" notices are scoped to the booking of the latest run;
  // whether a run is in flight comes from `runsInFlight`, per booking.
  const runIsForThis = runMutation.variables === bookingId;
  const runFailed = runMutation.isError && runIsForThis;

  // Running a plan costs a multi-model call, so the server refuses past a daily
  // budget and says so in its own message. Showing the generic failure text
  // instead would tell the user to retry the one thing that cannot succeed yet.
  const budgetMessage = runFailed ? budgetRefusal(runMutation.error) : null;

  const plan = data?.plan ?? null;
  // Concatenated rather than picked by role, because the server has already
  // emptied the list belonging to the other participant — so exactly one of
  // these is ever populated, and the drawer never has to know who is reading.
  // Both are optional: a plan generated before BR-2 simply has no checklist.
  const checklist = [
    ...(plan?.customerChecklist ?? []),
    ...(plan?.providerChecklist ?? []),
  ];
  // Older responses carry only `stale`; a truthy one there means "not current",
  // which is the safe reading when the server did not say which.
  const freshness = data?.freshness ?? (data?.stale ? "stale" : "current");
  const running = bookingId !== null && runsInFlight.has(bookingId);

  return (
    <Drawer
      anchor={fullScreen ? "bottom" : "right"}
      open={open}
      onClose={onClose}
      data-testid="readiness-drawer"
      PaperProps={{
        sx: {
          width: fullScreen ? "100%" : 480,
          maxHeight: fullScreen ? "90vh" : "100%",
          borderTopLeftRadius: fullScreen ? tokens.radius.lg : 0,
          borderTopRightRadius: fullScreen ? tokens.radius.lg : 0,
          bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper,
        },
      }}
    >
      <Box sx={{ p: 3 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 1 }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <AutoAwesomeIcon sx={{ color: tokens.color.gold }} />
            <Typography variant="h6" sx={{ fontFamily: tokens.font.display }}>
              {t("readiness.title")}
            </Typography>
          </Stack>
          <IconButton
            onClick={onClose}
            aria-label={t("readiness.close")}
            size="small"
          >
            <CloseIcon />
          </IconButton>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("readiness.subtitle")}
        </Typography>

        {isLoading && (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={28} />
          </Stack>
        )}

        {!isLoading && !plan && (
          <Stack spacing={2} sx={{ py: 2 }}>
            <Typography variant="body2">{t("readiness.empty")}</Typography>
            <Button
              variant="contained"
              onClick={() => runMutation.mutate(bookingId!)}
              disabled={running}
              data-testid="readiness-run"
              startIcon={
                running ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <AutoAwesomeIcon />
                )
              }
            >
              {running ? t("readiness.running") : t("readiness.run")}
            </Button>
          </Stack>
        )}

        {draftMutation.isError && (
          <Alert
            severity="warning"
            data-testid="readiness-draft-error"
            sx={{ mb: 2 }}
          >
            {draftRefusal(draftMutation.error) ?? t("readiness.draft_failed")}
          </Alert>
        )}

        {runFailed && (
          <Alert
            severity={budgetMessage ? "warning" : "error"}
            data-testid={budgetMessage ? "readiness-budget" : "readiness-error"}
            sx={{ mb: 2 }}
          >
            {budgetMessage ?? t("readiness.error")}
          </Alert>
        )}

        {runIsForThis && runMutation.data?.reused && !runFailed && (
          <Alert severity="info" data-testid="readiness-reused" sx={{ mb: 2 }}>
            {t("readiness.reused")}
          </Alert>
        )}

        {plan && (
          <Stack spacing={2.5}>
            {freshness !== "current" && (
              <Alert
                severity="warning"
                data-testid={
                  freshness === "unknown"
                    ? "readiness-unknown"
                    : "readiness-stale"
                }
                action={
                  <Button
                    size="small"
                    onClick={() => runMutation.mutate(bookingId!)}
                    disabled={running}
                    // Without this the label wraps to two lines on a 390px phone.
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    {t("readiness.rerun")}
                  </Button>
                }
              >
                {t(
                  freshness === "unknown"
                    ? "readiness.freshness_unknown"
                    : "readiness.stale",
                )}
              </Alert>
            )}

            <ReadinessHeadline plan={plan} t={t} />

            {plan.unavailableSections.length > 0 && (
              <Alert severity="info" data-testid="readiness-partial">
                {t("readiness.partial", {
                  sections: plan.unavailableSections.join(", "),
                })}
              </Alert>
            )}

            <Section title={t("readiness.agreed_scope")}>
              {plan.agreedScope.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t("readiness.no_scope")}
                </Typography>
              ) : (
                <Stack component="ul" sx={{ pl: 2.5, m: 0 }} spacing={0.5}>
                  {plan.agreedScope.map((item, i) => (
                    <Typography component="li" variant="body2" key={i}>
                      {item}
                    </Typography>
                  ))}
                </Stack>
              )}
            </Section>

            {plan.exclusions.length > 0 && (
              <Section title={t("readiness.exclusions")}>
                <Stack component="ul" sx={{ pl: 2.5, m: 0 }} spacing={0.5}>
                  {plan.exclusions.map((item, i) => (
                    <Typography component="li" variant="body2" key={i}>
                      {item}
                    </Typography>
                  ))}
                </Stack>
              </Section>
            )}

            {checklist.length > 0 && (
              <Section title={t("readiness.checklist")}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 1 }}
                >
                  {t("readiness.checklist_hint")}
                </Typography>
                <Stack component="ul" sx={{ pl: 2.5, m: 0 }} spacing={1}>
                  {checklist.map((item) => (
                    <Box component="li" key={item.id}>
                      <Typography variant="body2">{item.label}</Typography>
                      {/* Where it came from, in the reader's own language. An item
                          derived from a chat message is advice one participant
                          typed, not a platform fact, and it reads identically to
                          one derived from the accepted quote unless we say so. */}
                      <Typography variant="caption" color="text.secondary">
                        {item.evidence
                          .map((ref) => t(`readiness.source.${ref.source}`))
                          .filter((label, i, all) => all.indexOf(label) === i)
                          .join(" · ")}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Section>
            )}

            <Section
              title={t("readiness.findings", { count: plan.findings.length })}
            >
              {plan.findings.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t("readiness.no_findings")}
                </Typography>
              ) : (
                <Stack spacing={1.5}>
                  {[...plan.findings]
                    .sort(
                      (a, b) =>
                        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
                    )
                    .map((finding) => (
                      <FindingCard
                        key={finding.id}
                        finding={finding}
                        isDark={isDark}
                        t={t}
                        onDraft={
                          // Only from a current plan: a stale finding paired
                          // with today's booking makes a misleading draft, and
                          // the server refuses it anyway.
                          data?.runId &&
                          bookingId &&
                          onDraftReady &&
                          freshness === "current"
                            ? () =>
                                draftMutation.mutate({
                                  bookingId,
                                  runId: data.runId,
                                  findingId: finding.id,
                                })
                            : undefined
                        }
                        drafting={
                          draftMutation.isPending &&
                          draftMutation.variables?.findingId === finding.id
                        }
                        // One draft at a time: the first to finish closes the
                        // drawer, so a second would be paid for and discarded.
                        draftBusy={draftMutation.isPending}
                      />
                    ))}
                </Stack>
              )}
            </Section>

            <Divider />

            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Tooltip title={t("readiness.verification_hint")}>
                <Typography variant="caption" color="text.secondary">
                  {t("readiness.verification", {
                    dropped: plan.verification.droppedCount,
                  })}
                  {!plan.verification.semanticReviewRan &&
                    ` · ${t("readiness.unreviewed")}`}
                </Typography>
              </Tooltip>
              <Button
                size="small"
                onClick={() => runMutation.mutate(bookingId!)}
                disabled={running}
              >
                {running ? t("readiness.running") : t("readiness.rerun")}
              </Button>
            </Stack>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
};

const ReadinessHeadline: React.FC<{
  plan: ReadinessPlan;
  t: (k: string, o?: any) => string;
}> = ({ plan, t }) => {
  const Icon = READINESS_ICON[plan.readiness];
  const color =
    plan.readiness === "ready"
      ? tokens.color.earthLight
      : plan.readiness === "blocked"
        ? tokens.color.terra
        : tokens.color.gold;

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      data-testid="readiness-status"
      data-readiness={plan.readiness}
      sx={{ p: 1.5, borderRadius: tokens.radius.md, bgcolor: `${color}18` }}
    >
      <Icon sx={{ color }} />
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {t(`readiness.level.${plan.readiness}`)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t("readiness.generated_at", {
            time: new Date(plan.generatedAt).toLocaleString(),
          })}
        </Typography>
      </Box>
    </Stack>
  );
};

const FindingCard: React.FC<{
  finding: ReadinessFinding;
  isDark: boolean;
  t: (k: string, o?: any) => string;
  onDraft?: () => void;
  drafting?: boolean;
  /** Another finding's draft is in flight. */
  draftBusy?: boolean;
}> = ({ finding, isDark, t, onDraft, drafting, draftBusy }) => (
  <Box
    data-testid="readiness-finding"
    data-severity={finding.severity}
    sx={{
      p: 1.5,
      borderRadius: tokens.radius.md,
      border: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
      borderLeft: `3px solid ${SEVERITY_COLOR[finding.severity]}`,
    }}
  >
    <Stack
      direction="row"
      spacing={1}
      sx={{ mb: 0.75 }}
      flexWrap="wrap"
      useFlexGap
    >
      <Chip
        size="small"
        label={t(`readiness.severity.${finding.severity}`)}
        sx={{
          bgcolor: `${SEVERITY_COLOR[finding.severity]}22`,
          fontWeight: 600,
        }}
      />
      <Chip
        size="small"
        variant="outlined"
        label={t(`readiness.category.${finding.category}`)}
      />
      {finding.visibility !== "shared" && (
        <Chip
          size="small"
          variant="outlined"
          label={t(`readiness.visibility.${finding.visibility}`)}
        />
      )}
    </Stack>

    <Typography variant="body2">{finding.statement}</Typography>

    {finding.resolutionQuestion && (
      <Typography
        variant="body2"
        sx={{ mt: 0.75, fontStyle: "italic" }}
        color="text.secondary"
      >
        {finding.resolutionQuestion}
      </Typography>
    )}

    {onDraft && (
      <Button
        size="small"
        onClick={onDraft}
        disabled={drafting || draftBusy}
        data-testid="readiness-draft"
        startIcon={
          drafting ? <CircularProgress size={14} color="inherit" /> : undefined
        }
        sx={{ mt: 1, ml: -1 }}
      >
        {drafting ? t("readiness.drafting") : t("readiness.draft_message")}
      </Button>
    )}

    {finding.evidence.length > 0 && (
      <Box sx={{ mt: 1 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 600 }}
        >
          {t("readiness.evidence")}
        </Typography>
        <Stack spacing={0.25} sx={{ mt: 0.25 }}>
          {finding.evidence.map((ref, i) => (
            <Typography key={i} variant="caption" color="text.secondary">
              · {t(`readiness.source.${ref.source}`)} — {ref.field}
              {ref.excerpt ? `: "${ref.excerpt}"` : ""}
            </Typography>
          ))}
        </Stack>
      </Box>
    )}
  </Box>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <Box>
    <Typography variant="subtitle2" sx={{ mb: 0.75, fontWeight: 600 }}>
      {title}
    </Typography>
    {children}
  </Box>
);

export default ReadinessDrawer;
