import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Paper,
  Tabs,
  Tab,
  Card,
  CardContent,
  Rating,
  Avatar,
  Button,
  Grid,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Alert,
  Pagination,
  Select,
  FormControl,
  InputLabel,
  TextField,
  InputAdornment,
  Divider
} from '@mui/material';
import {
  Star,
  Person,
  MoreVert,
  Edit,
  Delete,
  Reply,
  Flag,
  Search,
  FilterList,
  RateReview,
  BusinessCenter
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { apiService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import ReviewDialog from '../reviews/ReviewDialog';
import ProviderResponseDialog from '../reviews/ProviderResponseDialog';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`reviews-tabpanel-${index}`}
      aria-labelledby={`reviews-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const MyReviewsPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // State management
  const [activeTab, setActiveTab] = useState(0);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [ratingFilter, setRatingFilter] = useState<number | ''>(
    searchParams.get('rating') ? Number(searchParams.get('rating')) : ''
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [responseDialogOpen, setResponseDialogOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);

  // Menu states
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuReview, setMenuReview] = useState<any>(null);

  const limit = 10;

  // Fetch customer's reviews (reviews they wrote)
  const { data: customerReviews, isLoading: customerLoading, error: customerError } = useQuery({
    queryKey: ['my-customer-reviews', page, sortBy, sortOrder, ratingFilter, searchQuery],
    queryFn: () => apiService.getMyCustomerReviews({
      page,
      limit,
      sortBy,
      sortOrder,
      ...(ratingFilter && { rating: Number(ratingFilter) })
    }),
    enabled: user?.userType === 'customer' || user?.userType === 'provider'
  });

  // Fetch provider's reviews (reviews about them)
  const { data: providerReviews, isLoading: providerLoading, error: providerError } = useQuery({
    queryKey: ['my-provider-reviews', page, sortBy, sortOrder, ratingFilter, searchQuery],
    queryFn: () => apiService.getMyProviderReviews({
      page,
      limit,
      sortBy,
      sortOrder,
      ...(ratingFilter && { rating: Number(ratingFilter) })
    }),
    enabled: user?.userType === 'provider'
  });

  // Fetch eligible bookings for reviews
  const { data: eligibleBookings } = useQuery({
    queryKey: ['eligible-bookings'],
    queryFn: () => apiService.getBookings({
      status: 'completed',
      page: 1,
      limit: 50
    }),
    enabled: user?.userType === 'customer'
  });

  // Delete review mutation
  const deleteReviewMutation = useMutation({
    mutationFn: (reviewId: string) => apiService.deleteReview(reviewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-customer-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['my-provider-reviews'] });
      toast.success('Review deleted successfully');
      handleMenuClose();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to delete review');
    },
  });

  // Flag review mutation
  const flagReviewMutation = useMutation({
    mutationFn: ({ reviewId, reason }: { reviewId: string; reason: string }) =>
      apiService.flagReview(reviewId, reason, 'Flagged by user'),
    onSuccess: () => {
      toast.success('Review has been flagged for moderation');
      handleMenuClose();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to flag review');
    },
  });

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    setPage(1); // Reset page when changing tabs
  };

  const handleRatingFilterChange = (newRating: number | '') => {
    setRatingFilter(newRating);
    // Update URL parameters
    if (newRating) {
      searchParams.set('rating', String(newRating));
    } else {
      searchParams.delete('rating');
    }
    setSearchParams(searchParams);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, review: any) => {
    setAnchorEl(event.currentTarget);
    setMenuReview(review);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuReview(null);
  };

  const handleEditReview = () => {
    setSelectedReview(menuReview);
    setEditMode(true);
    setReviewDialogOpen(true);
    handleMenuClose();
  };

  const handleDeleteReview = () => {
    if (menuReview) {
      deleteReviewMutation.mutate(menuReview.id);
    }
  };

  const handleRespondToReview = (review: any) => {
    setSelectedReview(review);
    setResponseDialogOpen(true);
  };

  const handleFlagReview = () => {
    if (menuReview) {
      flagReviewMutation.mutate({
        reviewId: menuReview.id,
        reason: 'inappropriate_content'
      });
    }
  };

  const handleCreateReview = (booking: any) => {
    setSelectedBooking(booking);
    setEditMode(false);
    setReviewDialogOpen(true);
  };

  const getEligibleBookingsWithoutReviews = () => {
    if (!eligibleBookings?.data || !customerReviews?.data) return [];
    if (!Array.isArray(eligibleBookings.data) || !Array.isArray(customerReviews.data)) return [];

    const reviewedBookingIds = customerReviews.data.map((review: any) => review.bookingId);
    return eligibleBookings.data.filter((booking: any) =>
      !reviewedBookingIds.includes(booking.id)
    );
  };

  const renderReviewCard = (review: any, showProvider = false) => {
    const isMyReview = review.customerId === user?.id;
    const canEdit = isMyReview && new Date(review.createdAt).getTime() > Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    const canDelete = isMyReview && new Date(review.createdAt).getTime() > Date.now() - (24 * 60 * 60 * 1000); // 24 hours

    return (
      <Card key={review.id} sx={{ mb: 2, position: 'relative' }}>
        <CardContent>
          {/* Review Header */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: showProvider ? 'primary.main' : 'secondary.main' }}>
                <Person />
              </Avatar>
              <Box>
                <Typography variant="subtitle1" fontWeight="bold">
                  {showProvider 
                    ? (review.provider?.businessName || 'Provider')
                    : (review.isAnonymous ? 'Anonymous' : review.customer?.firstName || 'Customer')
                  }
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
              {review.booking && (
                <Chip
                  label={review.booking.serviceType?.replace('_', ' ')}
                  size="small"
                  variant="outlined"
                />
              )}
              <IconButton onClick={(e) => handleMenuOpen(e, review)} size="small">
                <MoreVert />
              </IconButton>
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
                  <Grid item xs={12} sm={6} md={2.4} key={key}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </Typography>
                      <Rating value={Number(value)} size="small" readOnly />
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Provider Response */}
          {review.providerResponse && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Reply fontSize="small" />
                Provider Response
              </Typography>
              <Typography variant="body2">
                {review.providerResponse.response}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {new Date(review.providerResponse.createdAt).toLocaleDateString()}
              </Typography>
            </Box>
          )}

          {/* Action Buttons */}
          {showProvider && !review.providerResponse && user?.userType === 'provider' && (
            <Box sx={{ mt: 2 }}>
              <Button
                startIcon={<Reply />}
                variant="outlined"
                size="small"
                onClick={() => handleRespondToReview(review)}
              >
                Respond to Review
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderEligibleBookingsSection = () => {
    const eligibleBookingsData = getEligibleBookingsWithoutReviews();
    
    if (eligibleBookingsData.length === 0) {
      return (
        <Alert severity="info">
          No completed bookings available for review at this time.
        </Alert>
      );
    }

    return (
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <RateReview />
          Services Ready for Review
        </Typography>
        <Grid container spacing={2}>
          {eligibleBookingsData.map((booking: any) => (
            <Grid xs={12} md={6} key={booking.id}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justify: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant="h6">
                        {booking.provider?.businessName || 'Provider'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {booking.serviceType?.replace('_', ' ')}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(booking.scheduledDate).toLocaleDateString()}
                      </Typography>
                    </Box>
                    <Chip label={`$${booking.totalAmount}`} color="primary" size="small" />
                  </Box>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<Star />}
                    onClick={() => handleCreateReview(booking)}
                    fullWidth
                  >
                    Write Review
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  };

  const currentReviews = activeTab === 0 ? customerReviews : providerReviews;
  const isLoading = activeTab === 0 ? customerLoading : providerLoading;
  const error = activeTab === 0 ? customerError : providerError;

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 3 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <RateReview />
            My Reviews
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your reviews and ratings
          </Typography>
        </Box>

        {/* Tabs */}
        <Paper sx={{ mb: 3 }}>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            indicatorColor="primary"
            textColor="primary"
            variant="fullWidth"
          >
            <Tab 
              label="Reviews I've Written" 
              icon={<Edit />} 
              iconPosition="start"
              disabled={user?.userType !== 'customer' && user?.userType !== 'provider'}
            />
            {user?.userType === 'provider' && (
              <Tab 
                label="Reviews About My Services" 
                icon={<BusinessCenter />} 
                iconPosition="start"
              />
            )}
          </Tabs>
        </Paper>

        {/* Filter and Search Bar */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid xs={12} md={4}>
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
            <Grid xs={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Rating</InputLabel>
                <Select
                  value={ratingFilter}
                  onChange={(e) => handleRatingFilterChange(e.target.value as number | "")}
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
            <Grid xs={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  label="Sort By"
                >
                  <MenuItem value="createdAt">Date</MenuItem>
                  <MenuItem value="rating">Rating</MenuItem>
                  <MenuItem value="title">Title</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid xs={12} md={4}>
              <Button
                variant="outlined"
                startIcon={<FilterList />}
                onClick={() => {
                  setSearchQuery('');
                  handleRatingFilterChange('');
                  setSortBy('createdAt');
                  setSortOrder('desc');
                  setPage(1);
                }}
              >
                Clear Filters
              </Button>
            </Grid>
          </Grid>
        </Paper>

        {/* Tab Panels */}
        <TabPanel value={activeTab} index={0}>
          {user?.userType === 'customer' && renderEligibleBookingsSection()}
          
          {error ? (
            <Alert severity="error">
              Failed to load reviews. Please try again.
            </Alert>
          ) : isLoading ? (
            <Typography>Loading reviews...</Typography>
          ) : !currentReviews?.data?.length ? (
            <Alert severity="info">
              {activeTab === 0 
                ? "You haven't written any reviews yet."
                : "No reviews about your services yet."
              }
            </Alert>
          ) : (
            <>
              {currentReviews.data.map((review: any) => renderReviewCard(review, activeTab === 1))}
              
              {currentReviews.pagination && currentReviews.pagination.pages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                  <Pagination
                    count={currentReviews.pagination.pages}
                    page={page}
                    onChange={(_, newPage) => setPage(newPage)}
                    color="primary"
                  />
                </Box>
              )}
            </>
          )}
        </TabPanel>

        {user?.userType === 'provider' && (
          <TabPanel value={activeTab} index={1}>
            {error ? (
              <Alert severity="error">
                Failed to load reviews. Please try again.
              </Alert>
            ) : isLoading ? (
              <Typography>Loading reviews...</Typography>
            ) : !currentReviews?.data?.length ? (
              <Alert severity="info">
                No reviews about your services yet.
              </Alert>
            ) : (
              <>
                {currentReviews.data.map((review: any) => renderReviewCard(review, true))}
                
                {currentReviews.pagination && currentReviews.pagination.pages > 1 && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                    <Pagination
                      count={currentReviews.pagination.pages}
                      page={page}
                      onChange={(_, newPage) => setPage(newPage)}
                      color="primary"
                    />
                  </Box>
                )}
              </>
            )}
          </TabPanel>
        )}

        {/* Context Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          {menuReview?.customerId === user?.id && (
            <>
              <MenuItem onClick={handleEditReview}>
                <Edit sx={{ mr: 1 }} /> Edit Review
              </MenuItem>
              <MenuItem onClick={handleDeleteReview}>
                <Delete sx={{ mr: 1 }} /> Delete Review
              </MenuItem>
            </>
          )}
          <MenuItem onClick={handleFlagReview}>
            <Flag sx={{ mr: 1 }} /> Flag Review
          </MenuItem>
        </Menu>

        {/* Dialogs */}
        <ReviewDialog
          open={reviewDialogOpen}
          onClose={() => {
            setReviewDialogOpen(false);
            setSelectedReview(null);
            setSelectedBooking(null);
          }}
          booking={selectedBooking}
          existingReview={selectedReview}
          mode={editMode ? 'edit' : 'create'}
        />

        <ProviderResponseDialog
          open={responseDialogOpen}
          onClose={() => {
            setResponseDialogOpen(false);
            setSelectedReview(null);
          }}
          review={selectedReview}
        />
      </Box>
    </Container>
  );
};

export default MyReviewsPage;