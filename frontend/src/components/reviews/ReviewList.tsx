import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Rating,
  Avatar,
  Button,
  Grid,
  Chip,
  Pagination,
  Select,
  FormControl,
  InputLabel,
  TextField,
  InputAdornment,
  Alert,
  Paper,
  Divider,
  LinearProgress,
  MenuItem
} from '@mui/material';
import {
  Star,
  Person,
  Search,
  Reply,
  ThumbUp,
  CheckCircle,
  TrendingUp
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../../services/api';

interface ReviewListProps {
  providerId: string;
  showTitle?: boolean;
  showFilters?: boolean;
  maxHeight?: number;
}

const ReviewList: React.FC<ReviewListProps> = ({
  providerId,
  showTitle = true,
  showFilters = true,
  maxHeight
}) => {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [ratingFilter, setRatingFilter] = useState<number | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  const limit = showFilters ? 10 : 5;

  // Fetch provider reviews
  const { data: reviews, isLoading, error } = useQuery({
    queryKey: ['provider-reviews', providerId, page, sortBy, sortOrder, ratingFilter],
    queryFn: () => apiService.getProviderReviews(providerId, {
      page,
      limit,
      sortBy,
      sortOrder,
      ...(ratingFilter && { rating: Number(ratingFilter) })
    }),
    enabled: !!providerId
  });

  // Fetch review analytics
  const { data: analytics } = useQuery({
    queryKey: ['review-analytics', providerId],
    queryFn: () => apiService.getReviewAnalytics(providerId),
    enabled: !!providerId
  });

  const renderStarDistribution = () => {
    if (!analytics?.ratingDistribution) return null;

    const distribution = analytics.ratingDistribution;
    const totalReviews = analytics.totalReviews || 1;

    return (
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Rating Overview
        </Typography>
        <Grid container spacing={3}>
          <Grid xs={12} md={4}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h2" color="primary" sx={{ fontWeight: 'bold' }}>
                {analytics.averageRating?.toFixed(1) || '0.0'}
              </Typography>
              <Rating value={analytics.averageRating || 0} readOnly size="large" sx={{ mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Based on {totalReviews} reviews
              </Typography>
            </Box>
          </Grid>
          <Grid xs={12} md={8}>
            {[5, 4, 3, 2, 1].map((star) => (
              <Box key={star} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2" sx={{ minWidth: '20px' }}>
                  {star}
                </Typography>
                <Star sx={{ fontSize: 16, color: 'gold', mr: 1 }} />
                <LinearProgress
                  variant="determinate"
                  value={(distribution[star] || 0) / totalReviews * 100}
                  sx={{ flex: 1, mr: 2, height: 8, borderRadius: 4 }}
                />
                <Typography variant="body2" sx={{ minWidth: '40px' }}>
                  {distribution[star] || 0}
                </Typography>
              </Box>
            ))}
          </Grid>
        </Grid>
      </Paper>
    );
  };

  const renderReviewCard = (review: any) => {
    return (
      <Card key={review.id} sx={{ mb: 2 }}>
        <CardContent>
          {/* Review Header */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: 'secondary.main' }}>
                <Person />
              </Avatar>
              <Box>
                <Typography variant="subtitle1" fontWeight="bold">
                  {review.isAnonymous ? 'Anonymous Customer' : (review.customer?.firstName || 'Customer')}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Rating value={review.rating} readOnly size="small" />
                  <Typography variant="body2" color="text.secondary">
                    ({review.rating})
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    •
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </Typography>
                </Box>
              </Box>
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {review.booking?.serviceType && (
                <Chip
                  label={review.booking.serviceType.replace('_', ' ')}
                  size="small"
                  variant="outlined"
                />
              )}
              {review.isVerified && (
                <Chip
                  label="Verified"
                  size="small"
                  color="success"
                  icon={<CheckCircle />}
                />
              )}
            </Box>
          </Box>

          {/* Review Content */}
          <Typography variant="h6" sx={{ mb: 1 }}>
            {review.title}
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {review.comment}
          </Typography>

          {/* Criteria Breakdown */}
          {review.criteria && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Detailed Ratings:
              </Typography>
              <Grid container spacing={2}>
                {Object.entries(review.criteria).map(([key, value]) => (
                  <Grid key={key} xs={6} sm={4} md={2}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>
                        {`${key.charAt(0).toUpperCase() + key.slice(1)}: ${Number(value)}/5`}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Review Photos */}
          {review.photos && review.photos.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Photos:
              </Typography>
              <Grid container spacing={1}>
                {review.photos.map((photo: string, index: number) => (
                  <Grid key={index}>
                    <Box
                      component="img"
                      src={photo}
                      alt={`Review photo ${index + 1}`}
                      sx={{
                        width: 80,
                        height: 80,
                        objectFit: 'cover',
                        borderRadius: 1,
                        cursor: 'pointer'
                      }}
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Provider Response */}
          {review.providerResponse && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'primary.50', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Reply fontSize="small" />
                Provider Response
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {review.providerResponse.response}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {new Date(review.providerResponse.createdAt).toLocaleDateString()}
              </Typography>
            </Box>
          )}

          {/* Review Actions */}
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              startIcon={<ThumbUp />}
              variant="text"
              disabled
            >
              Helpful ({review.helpfulCount || 0})
            </Button>
          </Box>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box>
      {showTitle && (
        <Typography variant="h5" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Star />
          Customer Reviews
        </Typography>
      )}

      {/* Rating Analytics */}
      {analytics && renderStarDistribution()}

      {/* Filters */}
      {showFilters && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid xs={12} md={6}>
              <TextField
                fullWidth
                placeholder="Search reviews..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search />
                    </InputAdornment>
                  ),
                }}
                size="small"
              />
            </Grid>
            <Grid xs={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Rating</InputLabel>
                <Select
                  value={ratingFilter}
                  onChange={(e) => setRatingFilter(e.target.value as number | "")}
                  label="Rating"
                >
                  <MenuItem value="">All Ratings</MenuItem>
                  <MenuItem value={5}>5 Stars</MenuItem>
                  <MenuItem value={4}>4 Stars</MenuItem>
                  <MenuItem value={3}>3 Stars</MenuItem>
                  <MenuItem value={2}>2 Stars</MenuItem>
                  <MenuItem value={1}>1 Star</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid xs={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  label="Sort By"
                >
                  <MenuItem value="createdAt">Newest First</MenuItem>
                  <MenuItem value="rating">Highest Rated</MenuItem>
                  <MenuItem value="helpful">Most Helpful</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Reviews List */}
      <Box sx={maxHeight ? { maxHeight, overflowY: 'auto' } : {}}>
        {error ? (
          <Alert severity="error">
            Failed to load reviews. Please try again.
          </Alert>
        ) : isLoading ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography>Loading reviews...</Typography>
          </Box>
        ) : !reviews?.data?.length ? (
          <Alert severity="info">
            No reviews yet. Be the first to leave a review!
          </Alert>
        ) : (
          <>
            {/* Review Summary */}
            <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TrendingUp color="success" />
                    <Typography variant="h6">
                      {reviews.pagination?.total || 0} Reviews
                    </Typography>
                  </Box>
                </Grid>
                <Grid>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Star sx={{ color: 'gold' }} />
                    <Typography variant="h6">
                      {analytics?.averageRating?.toFixed(1) || 'N/A'} Average
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Box>

            {reviews.data.map(renderReviewCard)}
            
            {reviews.pagination && reviews.pagination.pages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination
                  count={reviews.pagination.pages}
                  page={page}
                  onChange={(_, newPage) => setPage(newPage)}
                  color="primary"
                />
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};

export default ReviewList;