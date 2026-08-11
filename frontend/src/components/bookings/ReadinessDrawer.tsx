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
 * Advisory panel. Everything here is read-only by design: the Copilot explains
 * and asks, it never changes a booking. Platform facts, AI findings, and the
 * verification summary are visually distinct so a reader can tell which is which.
 */
export const ReadinessDrawer: React.FC<Props> = ({ bookingId, open, onClose }) => {
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

  const runMutation = useMutation({
    mutationFn: () => apiService.createReadinessRun(bookingId!),
    onSuccess: (result) => {
      queryClient.setQueryData(["readiness", bookingId], result);
    },
  });

  const plan = data?.plan ?? null;
  const stale = data?.stale ?? false;
  const running = runMutation.isPending;

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
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <AutoAwesomeIcon sx={{ color: tokens.color.gold }} />
            <Typography variant="h6" sx={{ fontFamily: tokens.font.display }}>
              {t("readiness.title")}
            </Typography>
          </Stack>
          <IconButton onClick={onClose} aria-label={t("readiness.close")} size="small">
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
              onClick={() => runMutation.mutate()}
              disabled={running}
              data-testid="readiness-run"
              startIcon={running ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
            >
              {running ? t("readiness.running") : t("readiness.run")}
            </Button>
          </Stack>
        )}

        {runMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {t("readiness.error")}
          </Alert>
        )}

        {plan && (
          <Stack spacing={2.5}>
            {stale && (
              <Alert
                severity="warning"
                data-testid="readiness-stale"
                action={
                  <Button
                    size="small"
                    onClick={() => runMutation.mutate()}
                    disabled={running}
                    // Without this the label wraps to two lines on a 390px phone.
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    {t("readiness.rerun")}
                  </Button>
                }
              >
                {t("readiness.stale")}
              </Alert>
            )}

            <ReadinessHeadline plan={plan} t={t} />

            {plan.unavailableSections.length > 0 && (
              <Alert severity="info" data-testid="readiness-partial">
                {t("readiness.partial", { sections: plan.unavailableSections.join(", ") })}
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

            <Section title={t("readiness.findings", { count: plan.findings.length })}>
              {plan.findings.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t("readiness.no_findings")}
                </Typography>
              ) : (
                <Stack spacing={1.5}>
                  {[...plan.findings]
                    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
                    .map((finding) => (
                      <FindingCard key={finding.id} finding={finding} isDark={isDark} t={t} />
                    ))}
                </Stack>
              )}
            </Section>

            <Divider />

            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Tooltip title={t("readiness.verification_hint")}>
                <Typography variant="caption" color="text.secondary">
                  {t("readiness.verification", {
                    dropped: plan.verification.droppedCount,
                  })}
                  {!plan.verification.semanticReviewRan && ` · ${t("readiness.unreviewed")}`}
                </Typography>
              </Tooltip>
              <Button size="small" onClick={() => runMutation.mutate()} disabled={running}>
                {running ? t("readiness.running") : t("readiness.rerun")}
              </Button>
            </Stack>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
};

const ReadinessHeadline: React.FC<{ plan: ReadinessPlan; t: (k: string, o?: any) => string }> = ({
  plan,
  t,
}) => {
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
}> = ({ finding, isDark, t }) => (
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
    <Stack direction="row" spacing={1} sx={{ mb: 0.75 }} flexWrap="wrap" useFlexGap>
      <Chip
        size="small"
        label={t(`readiness.severity.${finding.severity}`)}
        sx={{ bgcolor: `${SEVERITY_COLOR[finding.severity]}22`, fontWeight: 600 }}
      />
      <Chip size="small" variant="outlined" label={t(`readiness.category.${finding.category}`)} />
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
      <Typography variant="body2" sx={{ mt: 0.75, fontStyle: "italic" }} color="text.secondary">
        {finding.resolutionQuestion}
      </Typography>
    )}

    {finding.evidence.length > 0 && (
      <Box sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
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

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Box>
    <Typography variant="subtitle2" sx={{ mb: 0.75, fontWeight: 600 }}>
      {title}
    </Typography>
    {children}
  </Box>
);

export default ReadinessDrawer;
