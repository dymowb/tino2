import { Button, LinearProgress, Stack, Typography } from "@mui/material";

interface ProfileCompletionPromptProps {
  completion: number;
  label: string;
  actionLabel: string;
  onAction: () => void;
}

const ProfileCompletionPrompt = ({
  completion,
  label,
  actionLabel,
  onAction,
}: ProfileCompletionPromptProps) => {
  const safeCompletion = Math.min(100, Math.max(0, completion));

  return (
    <Stack spacing={1}>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="caption">{safeCompletion}%</Typography>
      </Stack>
      <LinearProgress
        aria-label={label}
        variant="determinate"
        value={safeCompletion}
      />
      {safeCompletion < 100 && (
        <Button size="small" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Stack>
  );
};

export default ProfileCompletionPrompt;
