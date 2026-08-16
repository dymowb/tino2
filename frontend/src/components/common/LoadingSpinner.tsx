import React, { useId } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

interface LoadingSpinnerProps {
  message?: string;
  size?: number;
  fullHeight?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = 'Loading...', 
  size = 40,
  fullHeight = true 
}) => {
  // The spinner carries `role="progressbar"` from MUI, and a progressbar with no
  // accessible name is announced as "progress bar" and nothing else — the one
  // thing the listener already knows. The visible message is the name, pointed at
  // rather than duplicated into an aria-label, so it is announced once. This is
  // the Suspense fallback for every lazily-loaded route, so it was the unnamed
  // progressbar on all of them.
  const messageId = useId();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: fullHeight ? '100vh' : '200px',
        gap: 2,
      }}
    >
      <CircularProgress
        size={size}
        aria-labelledby={message ? messageId : undefined}
        aria-label={message ? undefined : 'Loading'}
        sx={{
          color: 'primary.main'
        }}
      />
      {message && (
        <Typography
          id={messageId}
          variant="body1"
          color="text.secondary"
          sx={{ textAlign: 'center' }}
        >
          {message}
        </Typography>
      )}
    </Box>
  );
};

export default LoadingSpinner;