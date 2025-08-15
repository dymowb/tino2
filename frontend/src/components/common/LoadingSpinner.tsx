import React from 'react';
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
        sx={{ 
          color: 'primary.main' 
        }} 
      />
      {message && (
        <Typography 
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