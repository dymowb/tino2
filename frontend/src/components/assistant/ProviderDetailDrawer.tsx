import React from "react";
import {
  Drawer,
  Box,
  Typography,
  Stack,
  Chip,
  Divider,
  Rating,
  IconButton,
  Avatar,
  Button,
} from "@mui/material";
import {
  Close,
  Security,
  Verified,
  LocationOn,
  AttachMoney,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { WorkflowProviderResult } from "../../services/api";
import FavoriteButton from "../providers/FavoriteButton";

interface Props {
  provider: WorkflowProviderResult | null;
  open: boolean;
  onClose: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

const ProviderDetailDrawer: React.FC<Props> = ({
  provider,
  open,
  onClose,
  isFavorite = false,
  onToggleFavorite,
}) => {
  const { t } = useTranslation(["assistant", "providers"]);

  if (!provider) return null;

  const ratingNum = Number(provider.rating);
  const hasRating =
    Number.isFinite(ratingNum) &&
    ratingNum > 0 &&
    (provider.totalReviews ?? 0) > 0;

  const initials = provider.businessName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 420 } } }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header */}
        <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton onClick={onClose} size="small" edge="start">
            <Close />
          </IconButton>
          <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
            {t("drawer.providerProfile", "Provider Profile")}
          </Typography>
          {onToggleFavorite && (
            <FavoriteButton saved={isFavorite} onToggle={onToggleFavorite} />
          )}
        </Box>
        <Divider />

        <Box sx={{ flex: 1, overflowY: "auto", p: 3 }}>
          {/* Avatar + name + match */}
          <Box
            sx={{ display: "flex", gap: 2, mb: 3, alignItems: "flex-start" }}
          >
            <Avatar
              sx={{
                width: 64,
                height: 64,
                bgcolor: "primary.main",
                fontSize: "1.5rem",
                fontWeight: 700,
              }}
            >
              {initials}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" fontWeight={700}>
                {provider.businessName}
              </Typography>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}
              >
                <Rating
                  value={hasRating ? ratingNum : 0}
                  readOnly
                  size="small"
                  precision={0.5}
                />
                <Typography variant="body2" color="text.secondary">
                  {hasRating
                    ? t("results.rating", {
                        rating: ratingNum.toFixed(1),
                        count: provider.totalReviews,
                      })
                    : t("providers:card.no_rating", "Novo")}
                </Typography>
              </Box>
              {/* Match score only applies to AI recommendations; hidden for direct (manual) views. */}
              {Number.isFinite(provider.matchScore) &&
                provider.matchScore > 0 && (
                  <Chip
                    label={t("results.matchScore", {
                      score: Math.round(provider.matchScore * 100),
                    })}
                    size="small"
                    color={
                      provider.matchScore >= 0.7
                        ? "success"
                        : provider.matchScore >= 0.4
                          ? "warning"
                          : "default"
                    }
                    sx={{ mt: 0.5 }}
                  />
                )}
            </Box>
          </Box>

          {/* Location */}
          {provider.location && (
            <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
              <LocationOn
                sx={{ color: "text.secondary", mt: "2px", fontSize: 18 }}
              />
              <Typography variant="body2" color="text.secondary">
                {provider.location.city}, {provider.location.state}
              </Typography>
            </Box>
          )}

          {/* Pricing */}
          {provider.pricing && (
            <Box sx={{ display: "flex", gap: 1, mb: 3 }}>
              <AttachMoney
                sx={{ color: "text.secondary", mt: "2px", fontSize: 18 }}
              />
              <Typography variant="body2">
                R$ {provider.pricing.baseRate}{" "}
                {t(
                  `providers:card.${provider.pricing.rateType || "hourly"}`,
                  "/hora",
                )}
              </Typography>
            </Box>
          )}

          {/* Verification badges */}
          <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
            {provider.isInsured && (
              <Chip
                icon={<Security fontSize="small" />}
                label={t("results.insured")}
                size="small"
                color="success"
                variant="outlined"
              />
            )}
            {provider.isBackgroundChecked && (
              <Chip
                icon={<Verified fontSize="small" />}
                label={t("results.backgroundChecked")}
                size="small"
                color="info"
                variant="outlined"
              />
            )}
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {/* Services */}
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            {t("drawer.services", "Services Offered")}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 3 }}>
            {provider.services.map((s, i) => (
              <Chip key={i} label={s} size="small" variant="outlined" />
            ))}
          </Box>
        </Box>
      </Box>
    </Drawer>
  );
};

export default ProviderDetailDrawer;
