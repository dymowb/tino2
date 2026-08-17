import React, { useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Tabs,
  Tab,
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Button,
  Slider,
  Switch,
  FormControlLabel,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Paper,
  Stack,
  Autocomplete,
} from "@mui/material";
import Grid from "@mui/material/Unstable_Grid2";
import {
  Verified,
  Security,
  MyLocation,
  Search,
  FilterList,
  Route,
  Timer,
  ArrowForward,
} from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  apiService,
  Provider,
  WorkflowProviderResult,
} from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import BookingDialog from "../bookings/BookingDialog";
import QuoteRequestDialog from "../quotes/QuoteRequestDialog";
import AIAssistantTab from "../assistant/AIAssistantTab";
import ProviderDetailDrawer from "../assistant/ProviderDetailDrawer";
import { tokens } from "../../theme/theme";
import FavoriteButton from "../providers/FavoriteButton";
import { useFavoriteProviders } from "../../hooks/useFavoriteProviders";
import { formatMoney } from '../../utils/money';

interface ExtendedProvider extends Provider {
  distance?: number;
  distanceText?: string;
  duration?: number;
  durationText?: string;
}

// ── Helpers ──────────────────────────────────────────────

const ACCENT_COLORS = [
  tokens.color.earth,
  tokens.color.terra,
  "#2A7BB5",
  "#5A8A3F",
  tokens.color.stone,
  "#7B5EA7",
];

function getProviderAccent(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return ACCENT_COLORS[Math.abs(hash) % ACCENT_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

// Max value of the price slider. At this value the price filter is treated as
// "no limit" and maxRate is not sent to the API. Keep above the highest plausible
// provider rate so the default search never hides anyone on price.
const MAX_PRICE_CAP = 300;

function formatDistance(distance: number): string {
  return distance < 1000
    ? `${Math.round(distance)}m`
    : `${(distance / 1000).toFixed(1)}km`;
}

function formatDuration(duration: number): string {
  const h = Math.floor(duration / 3600);
  const m = Math.floor((duration % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── StarRating ────────────────────────────────────────────

const StarRating: React.FC<{ value: number; count: number }> = ({
  value,
  count,
}) => {
  const { t } = useTranslation(["providers"]);
  const num = Number(value);
  // A provider with no usable rating (null/NaN, or zero reviews) shows a
  // "new" label instead of "NaN" or a misleading 0.0.
  const hasRating = Number.isFinite(num) && num > 0 && count > 0;
  const filled = hasRating ? Math.round(num) : 0;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Box
          key={n}
          component="span"
          sx={{
            color: n <= filled ? tokens.color.gold : "divider",
            fontSize: "0.9rem",
            lineHeight: 1,
          }}
        >
          ★
        </Box>
      ))}
      <Typography
        sx={{
          fontFamily: tokens.font.mono,
          fontSize: "0.75rem",
          color: "text.secondary",
          ml: 0.75,
        }}
      >
        {hasRating
          ? `${num.toFixed(1)} · ${count}`
          : t("providers:card.no_rating", "Novo")}
      </Typography>
    </Box>
  );
};

// ── ProviderCard ──────────────────────────────────────────

interface ProviderCardProps {
  provider: ExtendedProvider;
  onBook: () => void;
  onQuote: () => void;
  onViewProfile: () => void;
  saved: boolean;
  onFavorite: () => void;
}

const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  onBook,
  onQuote,
  onViewProfile,
  saved,
  onFavorite,
}) => {
  const { t } = useTranslation(["providers"]);
  const accent = getProviderAccent(provider.businessName);
  const initials = getInitials(provider.businessName);
  const price = provider.pricing?.baseRate || 50;
  const rateType = provider.pricing?.rateType || "hour";

  return (
    <Box
      sx={{
        borderRadius: tokens.radius.lg,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: `0 16px 40px ${accent}1A`,
          borderColor: accent,
        },
      }}
    >
      {/* 4:3 Header block */}
      <Box
        sx={{
          position: "relative",
          paddingTop: "62%",
          bgcolor: accent,
          overflow: "hidden",
        }}
      >
        <Box sx={{ position: "absolute", top: 12, left: 12, zIndex: 4 }}>
          <FavoriteButton saved={saved} onToggle={onFavorite} />
        </Box>
        {/* Geometric background shapes */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`,
          }}
        />
        <Box
          sx={{
            position: "absolute",
            width: "60%",
            height: "160%",
            borderRadius: "50%",
            bgcolor: "rgba(255,255,255,0.06)",
            right: "-15%",
            top: "-30%",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            width: "40%",
            height: "100%",
            borderRadius: "50%",
            bgcolor: "rgba(0,0,0,0.08)",
            left: "-5%",
            bottom: "-20%",
          }}
        />

        {/* Initials */}
        <Typography
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            fontFamily: tokens.font.display,
            fontSize: { xs: "2.5rem", md: "3rem" },
            fontWeight: 600,
            color: "rgba(255,255,255,0.92)",
            letterSpacing: "-0.02em",
            lineHeight: 1,
            zIndex: 1,
          }}
        >
          {initials}
        </Typography>

        {/* Price pill — bottom right */}
        <Box
          sx={{
            position: "absolute",
            bottom: 12,
            right: 12,
            zIndex: 2,
            bgcolor: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            borderRadius: tokens.radius.full,
            px: 1.5,
            py: 0.5,
            display: "flex",
            alignItems: "baseline",
            gap: 0.25,
          }}
        >
          <Typography
            sx={{
              fontFamily: tokens.font.mono,
              fontSize: "1rem",
              fontWeight: 500,
              color: "#fff",
            }}
          >
            {formatMoney(price)}
          </Typography>
          <Typography
            sx={{
              fontFamily: tokens.font.mono,
              fontSize: "0.7rem",
              color: "rgba(255,255,255,0.65)",
            }}
          >
            {t(`providers:card.${rateType}`, rateType)}
          </Typography>
        </Box>

        {/* Trust badges — bottom left */}
        <Box
          sx={{
            position: "absolute",
            bottom: 12,
            left: 12,
            zIndex: 2,
            display: "flex",
            gap: 0.75,
          }}
        >
          {provider.isBackgroundChecked && (
            <Tooltip title={t("providers:card.verified")}>
              <Box
                sx={{
                  bgcolor: "rgba(0,0,0,0.5)",
                  backdropFilter: "blur(8px)",
                  borderRadius: tokens.radius.full,
                  px: 1,
                  py: 0.4,
                  display: "flex",
                  alignItems: "center",
                  gap: 0.4,
                }}
              >
                <Verified sx={{ fontSize: "0.75rem", color: "#62D4FF" }} />
                <Typography
                  sx={{ fontSize: "0.68rem", color: "#fff", fontWeight: 600 }}
                >
                  {t("providers:card.verified")}
                </Typography>
              </Box>
            </Tooltip>
          )}
          {provider.isInsured && (
            <Tooltip title={t("providers:card.insured")}>
              <Box
                sx={{
                  bgcolor: "rgba(0,0,0,0.5)",
                  backdropFilter: "blur(8px)",
                  borderRadius: tokens.radius.full,
                  px: 1,
                  py: 0.4,
                  display: "flex",
                  alignItems: "center",
                  gap: 0.4,
                }}
              >
                <Security sx={{ fontSize: "0.75rem", color: "#7BCC6C" }} />
                <Typography
                  sx={{ fontSize: "0.68rem", color: "#fff", fontWeight: 600 }}
                >
                  {t("providers:card.insured")}
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>

        {/* Distance badge — top right */}
        {(provider.distanceText || provider.distance) && (
          <Box
            sx={{
              position: "absolute",
              top: 12,
              right: 12,
              zIndex: 2,
              bgcolor: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              borderRadius: tokens.radius.full,
              px: 1,
              py: 0.4,
              display: "flex",
              alignItems: "center",
              gap: 0.4,
            }}
          >
            <Route sx={{ fontSize: "0.75rem", color: "#fff" }} />
            <Typography
              sx={{ fontSize: "0.68rem", color: "#fff", fontWeight: 600 }}
            >
              {provider.distanceText || formatDistance(provider.distance!)}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Card body */}
      <Box
        sx={{
          p: 2.5,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          flex: 1,
        }}
      >
        {/* Name + rating */}
        <Box>
          <Typography
            variant="h5"
            sx={{
              fontFamily: tokens.font.display,
              fontWeight: 500,
              color: "text.primary",
              mb: 0.5,
              lineHeight: 1.2,
            }}
          >
            {provider.businessName}
          </Typography>
          <StarRating
            value={Number(provider.rating)}
            count={provider.totalReviews}
          />
          {!provider.isActive && (
            <Chip label={t("providers:favorites.unavailable")} size="small" color="default" sx={{ mt: 1 }} />
          )}
        </Box>

        {/* Description */}
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            lineHeight: 1.6,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {provider.description}
        </Typography>

        {/* Services */}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: "auto" }}>
          {provider.services?.slice(0, 3).map((svc, i) => (
            <Chip
              key={i}
              label={t(`providers:services.${svc}`, svc.replace(/_/g, " "))}
              size="small"
              sx={{
                borderRadius: tokens.radius.sm,
                fontSize: "0.7rem",
                height: 24,
                bgcolor: `${accent}14`,
                color: accent,
                border: `1px solid ${accent}30`,
              }}
            />
          ))}
          {provider.services && provider.services.length > 3 && (
            <Chip
              label={`+${provider.services.length - 3}`}
              size="small"
              sx={{
                borderRadius: tokens.radius.sm,
                fontSize: "0.7rem",
                height: 24,
              }}
            />
          )}
        </Box>

        {/* Stats row */}
        <Box sx={{ display: "flex", gap: 2, pt: 0.5 }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {Math.floor(Number(provider.completedJobs))}{" "}
            {t("providers:card.completed_jobs_label")}
          </Typography>
          {(provider.durationText || provider.duration) && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
              <Timer sx={{ fontSize: "0.75rem", color: "text.secondary" }} />
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {provider.durationText || formatDuration(provider.duration!)}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Actions */}
      <Box
        sx={{
          borderTop: "1px solid",
          borderColor: "divider",
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        <Button
          variant="text"
          color="primary"
          size="small"
          onClick={onViewProfile}
          sx={{ borderRadius: tokens.radius.full, fontSize: "0.8rem" }}
        >
          {t("providers:card.view_profile")}
        </Button>
        {/* Stack full-width on narrow phones (labels like "Solicitar Orçamento"
            wrap awkwardly in a half-width button); side-by-side from sm up. */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 1,
          }}
        >
          <Tooltip title={t("providers:card.request_quote_tip")}>
            <Button
              variant="outlined"
              color="primary"
              size="small"
              onClick={onQuote}
              disabled={!provider.isActive}
              sx={{
                borderRadius: tokens.radius.full,
                fontSize: "0.8rem",
                whiteSpace: "nowrap",
              }}
            >
              {t("providers:card.request_quote")}
            </Button>
          </Tooltip>
          <Tooltip title={t("providers:card.book_now_tip")}>
            <Button
              variant="contained"
              color="secondary"
              size="small"
              endIcon={<ArrowForward sx={{ fontSize: "0.9rem" }} />}
              onClick={onBook}
              disabled={!provider.isActive}
              sx={{
                borderRadius: tokens.radius.full,
                fontSize: "0.8rem",
                whiteSpace: "nowrap",
              }}
            >
              {t("providers:card.book_now")}
            </Button>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );
};

// ── Page ─────────────────────────────────────────────────

const FindProvidersPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation(["providers"]);

  const [searchParams, setSearchParams] = useState({
    latitude: -27.5954,
    longitude: -48.548,
    radius: 25,
    serviceTypes: [] as string[],
    sortBy: "distance" as "distance" | "rating" | "price" | "response_time",
    minRating: 0,
    maxPrice: 300, // 300 == "no cap" (above the highest provider rate); see MAX_PRICE_CAP
    hasInsurance: false,
    hasBackgroundCheck: false,
    isAvailable: false,
  });

  const [addressSearch, setAddressSearch] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
    null,
  );
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [selectedServiceForQuote, setSelectedServiceForQuote] = useState("");
  const [quoteProvider, setQuoteProvider] = useState<ExtendedProvider | null>(
    null,
  );
  const [detailProvider, setDetailProvider] =
    useState<WorkflowProviderResult | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [aiCompleted, setAiCompleted] = useState(false);
  const favoritesQuery = useFavoriteProviders(user?.userType === "customer");

  // Deep-link from Home "Popular Services": ?service=<slug> lands on the AI tab
  // (index 0) and seeds a service-specific example prompt in the assistant.
  const [urlParams] = useSearchParams();
  const serviceExample = urlParams.get("service") || undefined;

  const { data: serviceCatalog = [] } = useQuery({
    queryKey: ["service-catalog"],
    queryFn: () => apiService.getServiceCatalog(),
    staleTime: 10 * 60 * 1000,
  });

  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error(t("providers:messages.geolocation_unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        setSearchParams((p) => ({ ...p, latitude, longitude }));
        toast.success(t("providers:messages.location_updated"));
      },
      () => toast.error(t("providers:messages.location_error")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }, [t]);

  const handleAddressSearch = async () => {
    if (!addressSearch.trim()) {
      toast.error(t("providers:messages.enter_address"));
      return;
    }
    try {
      const result = await apiService.geocodeAddress(addressSearch);
      if (result?.location?.latitude && result?.location?.longitude) {
        setSearchParams((p) => ({
          ...p,
          latitude: result.location.latitude,
          longitude: result.location.longitude,
        }));
        toast.success(
          t("providers:messages.location_set", {
            address: result.formattedAddress || addressSearch,
          }),
        );
      }
    } catch {
      toast.error(t("providers:messages.location_failed"));
    }
  };

  const {
    data: providersData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["providers-gps", searchParams],
    // At the slider's max (MAX_PRICE_CAP) we treat price as unbounded and omit
    // maxRate entirely — otherwise the default would silently hide pricier providers.
    queryFn: () =>
      apiService.searchProvidersGPS({
        ...searchParams,
        maxPrice:
          searchParams.maxPrice >= MAX_PRICE_CAP
            ? undefined
            : searchParams.maxPrice,
      }),
    staleTime: 5 * 60 * 1000,
  });

  const providers: ExtendedProvider[] = React.useMemo(() => {
    const raw = providersData?.data?.providers;
    return Array.isArray(raw) ? raw : [];
  }, [providersData]);

  const totalCount = providersData?.data?.totalCount || 0;

  const handleBookNow = (provider: ExtendedProvider) => {
    if (!isAuthenticated) {
      toast.error(t("providers:messages.login_required_booking"));
      return;
    }
    if (user?.userType !== "customer") {
      toast.error(t("providers:messages.customers_only_booking"));
      return;
    }
    setSelectedProvider(provider);
    setShowBookingDialog(true);
  };

  const handleQuoteRequest = (provider: ExtendedProvider) => {
    if (!isAuthenticated) {
      toast.error(t("providers:messages.login_required_quote"));
      return;
    }
    if (user?.userType !== "customer") {
      toast.error(t("providers:messages.customers_only_quote"));
      return;
    }
    setSelectedServiceForQuote(provider.services?.[0] || "");
    setQuoteProvider(provider);
    setShowQuoteDialog(true);
  };

  // Open the shared provider profile drawer from a manual search card. The drawer
  // expects the AI result shape, so map the search provider into it (matchScore 0
  // → the match chip is hidden for direct/manual views).
  const handleViewProfile = (provider: ExtendedProvider) => {
    setDetailProvider({
      providerId: provider.id,
      providerName: provider.businessName,
      businessName: provider.businessName,
      services: provider.services || [],
      matchScore: 0,
      rating: Number(provider.rating) || 0,
      totalReviews: provider.totalReviews ?? 0,
      pricing: provider.pricing
        ? {
            baseRate: provider.pricing.baseRate,
            currency: provider.pricing.currency ?? "BRL",
            rateType: provider.pricing.rateType,
          }
        : null,
      location:
        provider.location && typeof provider.location === "object"
          ? { city: provider.location.city, state: provider.location.state }
          : null,
      isBackgroundChecked: !!provider.isBackgroundChecked,
      isInsured: !!provider.isInsured,
    });
  };

  return (
    <Box sx={{ maxWidth: "1400px", mx: "auto", px: { xs: 2, md: 4 }, py: 4 }}>
      {/* Page header */}
      <Box sx={{ mb: 4 }}>
        <Typography
          sx={{
            fontFamily: tokens.font.body,
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            // 11.5px terra is 4.3:1 on this surface — an eyebrow label is small
            // text, so it needs 4.5. Same hue, darker shade.
            color: tokens.color.terraDark,
            mb: 1,
          }}
        >
          {t("providers:search.title")}
        </Typography>
        <Typography
          variant="h3"
          component="h1"
          sx={{ fontFamily: tokens.font.display, fontWeight: 500 }}
        >
          {t("providers:search.title")}
        </Typography>
      </Box>

      <Tabs
        value={activeTab}
        onChange={(_e, v) => setActiveTab(v)}
        sx={{ mb: 4, borderBottom: "1px solid", borderColor: "divider" }}
      >
        <Tab label={t("assistant:tabs.aiAssistant")} />
        <Tab label={t("assistant:tabs.browseFilter")} />
        {user?.userType === "customer" && (
          <Tab label={t("providers:favorites.tab")} />
        )}
      </Tabs>

      {activeTab === 0 && (
        <AIAssistantTab
          serviceExample={serviceExample}
          onComplete={() => setAiCompleted(true)}
          onReset={() => setAiCompleted(false)}
        />
      )}

      {activeTab === 1 && (
        <>
          {/* Search + location bar */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr auto auto" },
              gap: 2,
              mb: 3,
            }}
          >
            <TextField
              fullWidth
              size="small"
              label={t("providers:search.search_by_address")}
              value={addressSearch}
              onChange={(e) => setAddressSearch(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleAddressSearch()}
              InputProps={{
                endAdornment: (
                  <IconButton size="small" onClick={handleAddressSearch}>
                    <Search fontSize="small" />
                  </IconButton>
                ),
              }}
            />
            <Button
              variant="outlined"
              startIcon={<MyLocation />}
              onClick={getCurrentLocation}
              sx={{ whiteSpace: "nowrap", height: 40 }}
            >
              {t("providers:search.use_my_location")}
            </Button>
            <Button
              variant={showFilters ? "contained" : "outlined"}
              color={showFilters ? "primary" : "inherit"}
              startIcon={<FilterList />}
              onClick={() => setShowFilters(!showFilters)}
              sx={{ whiteSpace: "nowrap", height: 40 }}
            >
              {t("providers:search.filters")}
            </Button>
          </Box>

          {/* Filters panel */}
          {showFilters && (
            <Paper sx={{ p: 3, mb: 4 }} variant="outlined">
              <Grid container spacing={3}>
                <Grid xs={12} md={6}>
                  <Autocomplete
                    multiple
                    options={serviceCatalog}
                    value={searchParams.serviceTypes}
                    onChange={(_, v) =>
                      setSearchParams((p) => ({ ...p, serviceTypes: v }))
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        label={t("providers:search.service_types")}
                        placeholder={
                          searchParams.serviceTypes.length === 0
                            ? t("providers:search.service_type_placeholder")
                            : ""
                        }
                      />
                    )}
                    renderTags={(value, getTagProps) =>
                      value.map((opt, i) => (
                        <Chip
                          label={opt}
                          size="small"
                          {...getTagProps({ index: i })}
                          key={opt}
                        />
                      ))
                    }
                  />
                </Grid>

                <Grid xs={12} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{t("providers:search.sort_by")}</InputLabel>
                    <Select
                      value={searchParams.sortBy}
                      label={t("providers:search.sort_by")}
                      onChange={(e) =>
                        setSearchParams((p) => ({
                          ...p,
                          sortBy: e.target.value as typeof p.sortBy,
                        }))
                      }
                    >
                      <MenuItem value="distance">
                        {t("providers:search.distance")}
                      </MenuItem>
                      <MenuItem value="rating">
                        {t("providers:search.rating_option")}
                      </MenuItem>
                      <MenuItem value="price">
                        {t("providers:search.price_option")}
                      </MenuItem>
                      <MenuItem value="response_time">
                        {t("providers:search.response_time_option")}
                      </MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid xs={12} md={3}>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", display: "block", mb: 1 }}
                  >
                    {t("providers:search.search_radius_km", {
                      radius: searchParams.radius,
                    })}
                  </Typography>
                  <Slider
                    value={searchParams.radius}
                    onChange={(_, v) =>
                      setSearchParams((p) => ({ ...p, radius: v as number }))
                    }
                    min={1}
                    max={100}
                    marks={[
                      { value: 5, label: "5km" },
                      { value: 25, label: "25km" },
                      { value: 100, label: "100km" },
                    ]}
                    valueLabelDisplay="auto"
                    size="small"
                  />
                </Grid>

                <Grid xs={12} md={3}>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", display: "block", mb: 1 }}
                  >
                    {searchParams.maxPrice >= MAX_PRICE_CAP
                      ? t("providers:search.max_price_any")
                      : t("providers:search.max_price_value", {
                          price: searchParams.maxPrice,
                        })}
                  </Typography>
                  <Slider
                    value={searchParams.maxPrice}
                    onChange={(_, v) =>
                      setSearchParams((p) => ({ ...p, maxPrice: v as number }))
                    }
                    min={50}
                    max={MAX_PRICE_CAP}
                    step={10}
                    marks={[
                      { value: 50, label: formatMoney(50) },
                      { value: MAX_PRICE_CAP, label: "∞" },
                    ]}
                    valueLabelDisplay="auto"
                    size="small"
                  />
                </Grid>

                <Grid xs={12}>
                  <Stack
                    direction="row"
                    spacing={3}
                    flexWrap="wrap"
                    alignItems="center"
                  >
                    <Box sx={{ minWidth: 200 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: "text.secondary",
                          display: "block",
                          mb: 1,
                        }}
                      >
                        {t("providers:search.minimum_rating_value", {
                          rating: searchParams.minRating,
                        })}
                      </Typography>
                      <Slider
                        value={searchParams.minRating}
                        onChange={(_, v) =>
                          setSearchParams((p) => ({
                            ...p,
                            minRating: v as number,
                          }))
                        }
                        min={0}
                        max={5}
                        step={0.5}
                        valueLabelDisplay="auto"
                        size="small"
                        marks={[
                          { value: 0, label: t("common:home.all_rating") },
                          { value: 4, label: "4★" },
                          { value: 5, label: "5★" },
                        ]}
                      />
                    </Box>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={searchParams.hasInsurance}
                          onChange={(e) =>
                            setSearchParams((p) => ({
                              ...p,
                              hasInsurance: e.target.checked,
                            }))
                          }
                        />
                      }
                      label={
                        <Typography variant="body2">
                          {t("providers:search.insurance")}
                        </Typography>
                      }
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={searchParams.hasBackgroundCheck}
                          onChange={(e) =>
                            setSearchParams((p) => ({
                              ...p,
                              hasBackgroundCheck: e.target.checked,
                            }))
                          }
                        />
                      }
                      label={
                        <Typography variant="body2">
                          {t("providers:search.background_check")}
                        </Typography>
                      }
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={searchParams.isAvailable}
                          onChange={(e) =>
                            setSearchParams((p) => ({
                              ...p,
                              isAvailable: e.target.checked,
                            }))
                          }
                        />
                      }
                      label={
                        <Typography variant="body2">
                          {t("providers:search.verified_only_label")}
                        </Typography>
                      }
                    />
                  </Stack>
                </Grid>
              </Grid>
            </Paper>
          )}

          {/* Results */}
          {isLoading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              {/* A progressbar with no name is announced as "progress bar" and
                  nothing else, which is the one thing a screen reader user
                  already knows. */}
              <CircularProgress aria-label={t("providers:loading")} />
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {t("providers:search.error_loading")}
            </Alert>
          )}

          {!isLoading && !error && (
            <>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 3,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", fontWeight: 500 }}
                >
                  {t(
                    totalCount === 1
                      ? "providers:search.providers_found"
                      : "providers:search.providers_found_plural",
                    { count: totalCount },
                  )}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => refetch()}
                  startIcon={<Search />}
                >
                  {t("providers:search.refresh")}
                </Button>
              </Box>

              {providers.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 10 }}>
                  <Typography
                    variant="h5"
                    sx={{
                      fontFamily: tokens.font.display,
                      color: "text.secondary",
                      mb: 1,
                    }}
                  >
                    Nenhum prestador encontrado
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {t("providers:search.no_providers_description")}
                  </Typography>
                </Box>
              ) : (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, 1fr)",
                      lg: "repeat(3, 1fr)",
                    },
                    gap: 3,
                  }}
                >
                  {providers.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      onBook={() => handleBookNow(provider)}
                      onQuote={() => handleQuoteRequest(provider)}
                      onViewProfile={() => handleViewProfile(provider)}
                      saved={favoritesQuery.savedIds.has(provider.id)}
                      onFavorite={() =>
                        favoritesQuery.toggle({
                          providerId: provider.id,
                          saved: favoritesQuery.savedIds.has(provider.id),
                        })
                      }
                    />
                  ))}
                </Box>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 2 && user?.userType === "customer" && (
        <Box>
          <Typography
            variant="h5"
            sx={{ fontFamily: tokens.font.display, mb: 3 }}
          >
            {t("providers:favorites.title")}
          </Typography>
          {favoritesQuery.isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              {/* A progressbar with no name is announced as "progress bar" and
                  nothing else, which is the one thing a screen reader user
                  already knows. */}
              <CircularProgress aria-label={t("providers:loading")} />
            </Box>
          ) : favoritesQuery.favorites.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 10 }}>
              <Typography variant="h6">
                {t("providers:favorites.empty")}
              </Typography>
              <Typography color="text.secondary">
                {t("providers:favorites.empty_description")}
              </Typography>
            </Box>
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  lg: "repeat(3, 1fr)",
                },
                gap: 3,
              }}
            >
              {favoritesQuery.favorites.map(({ provider }) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  onBook={() => handleBookNow(provider)}
                  onQuote={() => handleQuoteRequest(provider)}
                  onViewProfile={() => handleViewProfile(provider)}
                  saved
                  onFavorite={() =>
                    favoritesQuery.toggle({
                      providerId: provider.id,
                      saved: true,
                    })
                  }
                />
              ))}
            </Box>
          )}
        </Box>
      )}

      <BookingDialog
        open={showBookingDialog}
        onClose={() => {
          setShowBookingDialog(false);
          setSelectedProvider(null);
        }}
        provider={selectedProvider}
        serviceType={searchParams.serviceTypes[0] || ""}
      />
      <QuoteRequestDialog
        open={showQuoteDialog}
        onClose={() => {
          setShowQuoteDialog(false);
          setSelectedServiceForQuote("");
          setQuoteProvider(null);
        }}
        serviceType={selectedServiceForQuote}
        providerName={quoteProvider?.businessName}
        providerId={quoteProvider?.id}
      />
      <ProviderDetailDrawer
        provider={detailProvider}
        open={!!detailProvider}
        onClose={() => setDetailProvider(null)}
        isFavorite={
          !!detailProvider &&
          favoritesQuery.savedIds.has(detailProvider.providerId)
        }
        onToggleFavorite={
          detailProvider
            ? () =>
                favoritesQuery.toggle({
                  providerId: detailProvider.providerId,
                  saved: favoritesQuery.savedIds.has(detailProvider.providerId),
                })
            : undefined
        }
      />
    </Box>
  );
};

export default FindProvidersPage;
