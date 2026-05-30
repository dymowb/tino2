import React from 'react';
import { Box, Skeleton } from '@mui/material';
import { tokens } from '../../theme/theme';

interface PageSkeletonProps {
  variant?: 'cards' | 'list' | 'dashboard' | 'detail';
}

const PageSkeleton: React.FC<PageSkeletonProps> = ({ variant = 'cards' }) => {
  if (variant === 'dashboard') {
    return (
      <Box sx={{ px: { xs: 2, md: 4 }, py: 4, maxWidth: 1200, mx: 'auto' }}>
        <Skeleton variant="text" width={240} height={48} sx={{ mb: 0.5 }} />
        <Skeleton variant="text" width={160} height={24} sx={{ mb: 3 }} />
        <Box sx={{ display: 'flex', gap: 1, mb: 4 }}>
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} variant="rounded" width={100} height={34} sx={{ borderRadius: tokens.radius.full }} />
          ))}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2, mb: 4 }}>
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} variant="rounded" height={96} sx={{ borderRadius: tokens.radius.lg }} />
          ))}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 3 }}>
          <Skeleton variant="rounded" height={400} sx={{ borderRadius: tokens.radius.lg }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Skeleton variant="rounded" height={180} sx={{ borderRadius: tokens.radius.lg }} />
            <Skeleton variant="rounded" height={200} sx={{ borderRadius: tokens.radius.lg }} />
          </Box>
        </Box>
      </Box>
    );
  }

  if (variant === 'list') {
    return (
      <Box sx={{ px: { xs: 2, md: 4 }, py: 4, maxWidth: 900, mx: 'auto' }}>
        <Skeleton variant="text" width={200} height={48} sx={{ mb: 0.5 }} />
        <Skeleton variant="text" width={100} height={22} sx={{ mb: 4 }} />
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 4 }}>
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} variant="rounded" width={90} height={32} sx={{ borderRadius: tokens.radius.full }} />
          ))}
        </Box>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} variant="rounded" height={160} sx={{ borderRadius: tokens.radius.lg, mb: 2 }} />
        ))}
      </Box>
    );
  }

  if (variant === 'detail') {
    return (
      <Box sx={{ px: { xs: 2, md: 4 }, py: 4, maxWidth: 800, mx: 'auto' }}>
        <Skeleton variant="text" width={300} height={48} sx={{ mb: 0.5 }} />
        <Skeleton variant="text" width={200} height={22} sx={{ mb: 4 }} />
        <Skeleton variant="rounded" height={280} sx={{ borderRadius: tokens.radius.lg, mb: 3 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: tokens.radius.lg }} />
          ))}
        </Box>
      </Box>
    );
  }

  // default: cards grid
  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 4 }}>
      <Skeleton variant="text" width={280} height={56} sx={{ mb: 1 }} />
      <Skeleton variant="text" width={180} height={28} sx={{ mb: 4 }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2.5 }}>
        {[...Array(6)].map((_, i) => (
          <Box key={i}>
            <Skeleton variant="rounded" height={180} sx={{ borderRadius: `${tokens.radius.lg} ${tokens.radius.lg} 0 0`, mb: 0 }} />
            <Skeleton variant="rounded" height={200} sx={{ borderRadius: `0 0 ${tokens.radius.lg} ${tokens.radius.lg}` }} />
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default PageSkeleton;
