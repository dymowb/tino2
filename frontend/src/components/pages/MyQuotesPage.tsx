import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Tabs,
  Tab,
  Chip,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Divider,
  Avatar,
  Rating,
  Tooltip
} from '@mui/material';
import {
  RequestQuote,
  Send,
  CheckCircle,
  Cancel,
  MoreVert,
  Star,
  LocationOn,
  Schedule,
  AttachMoney,
  Visibility,
  Delete,
  Edit,
  Compare,
  Person
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { apiService, QuoteRequest, Quote } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import QuoteRequestDialog from '../quotes/QuoteRequestDialog';
import QuoteSubmissionDialog from '../quotes/QuoteSubmissionDialog';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const MyQuotesPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tabValue, setTabValue] = useState(0);
  const [selectedRequest, setSelectedRequest] = useState<QuoteRequest | null>(null);
  const [quotesToCompare, setQuotesToCompare] = useState<Quote[]>([]);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showSubmissionDialog, setShowSubmissionDialog] = useState(false);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);

  // Fetch quote requests for customers
  const { data: quoteRequests, isLoading: requestsLoading } = useQuery({
    queryKey: ['quote-requests'],
    queryFn: () => apiService.searchQuoteRequests(),
    enabled: user?.userType === 'customer',
  });

  // Fetch available quote requests for providers
  const { data: availableRequests, isLoading: availableLoading } = useQuery({
    queryKey: ['available-quote-requests'],
    queryFn: () => apiService.searchQuoteRequests({ status: 'open' }),
    enabled: user?.userType === 'provider',
  });

  // Fetch user's quotes
  const { data: quotes, isLoading: quotesLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => apiService.searchQuotes(),
  });

  // Update quote status mutation
  const updateQuoteStatusMutation = useMutation({
    mutationFn: ({ quoteId, status, reason }: { quoteId: string; status: string; reason?: string }) =>
      apiService.updateQuoteStatus(quoteId, status as any, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      toast.success('Quote status updated successfully!');
      setAnchorEl(null);
      setSelectedQuote(null);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to update quote status');
    },
  });

  // Close quote request mutation
  const closeQuoteRequestMutation = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason?: string }) =>
      apiService.closeQuoteRequest(requestId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      toast.success('Quote request closed successfully!');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to close quote request');
    },
  });

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, quote: Quote) => {
    setAnchorEl(event.currentTarget);
    setSelectedQuote(quote);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedQuote(null);
  };

  const handleAcceptQuote = (quote: Quote) => {
    updateQuoteStatusMutation.mutate({ 
      quoteId: quote.id, 
      status: 'accepted' 
    });
  };

  const handleRejectQuote = (quote: Quote) => {
    updateQuoteStatusMutation.mutate({ 
      quoteId: quote.id, 
      status: 'rejected',
      reason: 'Customer chose another provider'
    });
  };

  const handleWithdrawQuote = (quote: Quote) => {
    updateQuoteStatusMutation.mutate({ 
      quoteId: quote.id, 
      status: 'withdrawn',
      reason: 'Provider withdrew quote'
    });
  };

  const handleCompareQuotes = (requestId: string) => {
    const requestQuotes = quotes?.data?.filter(quote => quote.requestId === requestId) || [];
    setQuotesToCompare(requestQuotes);
    setShowCompareDialog(true);
  };

  const formatServiceName = (service: string) => {
    return service.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'accepted': return 'success';
      case 'rejected': return 'error';
      case 'expired': return 'default';
      case 'withdrawn': return 'secondary';
      case 'open': return 'primary';
      case 'closed': return 'success';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'urgent': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  if (requestsLoading || quotesLoading || availableLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <RequestQuote />
          My Quotes
        </Typography>
        {user?.userType === 'customer' && (
          <Button
            variant="contained"
            startIcon={<RequestQuote />}
            onClick={() => setShowRequestDialog(true)}
          >
            Request New Quote
          </Button>
        )}
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          {user?.userType === 'customer' && <Tab value={0} label={`My Requests (${quoteRequests?.data?.length || 0})`} />}
          {user?.userType === 'customer' && <Tab value={1} label={`Received Quotes (${quotes?.data?.length || 0})`} />}
          {user?.userType === 'provider' && <Tab value={0} label={`Available Requests (${availableRequests?.data?.length || 0})`} />}
          {user?.userType === 'provider' && <Tab value={1} label={`My Quotes (${quotes?.data?.length || 0})`} />}
        </Tabs>
      </Box>

      {user?.userType === 'customer' && (
        <>
          {/* Customer Quote Requests */}
          <TabPanel value={tabValue} index={0}>
            {quoteRequests?.data?.length === 0 ? (
              <Alert severity="info">
                You haven't created any quote requests yet. Click "Request New Quote" to get started.
              </Alert>
            ) : (
              <Grid container spacing={3}>
                {quoteRequests?.data?.map((request) => (
                  <Grid xs={12} md={6} key={request.id}>
                    <Card>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                          <Typography variant="h6">
                            {formatServiceName(request.serviceType)}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip 
                              label={request.status.toUpperCase()} 
                              size="small" 
                              color={getStatusColor(request.status) as any}
                            />
                            <Chip 
                              label={request.urgency.toUpperCase()} 
                              size="small" 
                              color={getUrgencyColor(request.urgency) as any}
                            />
                          </Box>
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          {request.description}
                        </Typography>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <LocationOn sx={{ fontSize: 'small' }} />
                          <Typography variant="body2">
                            {request.location.city}, {request.location.state}
                          </Typography>
                        </Box>

                        {request.budget && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <AttachMoney sx={{ fontSize: 'small' }} />
                            <Typography variant="body2">
                              Budget: ${request.budget.min} - ${request.budget.max}
                            </Typography>
                          </Box>
                        )}

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                          <Schedule sx={{ fontSize: 'small' }} />
                          <Typography variant="body2">
                            Created: {format(new Date(request.createdAt), 'MMM dd, yyyy')}
                          </Typography>
                        </Box>

                        <Typography variant="body2" sx={{ mb: 2 }}>
                          <strong>Quotes Received: {request.quotesReceived}</strong>
                        </Typography>

                        <Box sx={{ display: 'flex', gap: 1 }}>
                          {request.quotesReceived > 0 && (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<Compare />}
                              onClick={() => handleCompareQuotes(request.id)}
                            >
                              Compare Quotes
                            </Button>
                          )}
                          {request.status === 'open' && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="warning"
                              startIcon={<Cancel />}
                              onClick={() => closeQuoteRequestMutation.mutate({ requestId: request.id, reason: 'Customer cancelled' })}
                            >
                              Close Request
                            </Button>
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </TabPanel>

          {/* Customer Received Quotes */}
          <TabPanel value={tabValue} index={1}>
            {quotes?.data?.length === 0 ? (
              <Alert severity="info">
                You haven't received any quotes yet. Create some quote requests to get quotes from providers.
              </Alert>
            ) : (
              <Grid container spacing={3}>
                {quotes?.data?.map((quote) => (
                  <Grid xs={12} md={6} key={quote.id}>
                    <Card>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                          <Typography variant="h6">
                            {formatServiceName(quote.serviceType)}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip 
                              label={quote.status.toUpperCase()} 
                              size="small" 
                              color={getStatusColor(quote.status) as any}
                            />
                            <IconButton
                              size="small"
                              onClick={(e) => handleMenuClick(e, quote)}
                            >
                              <MoreVert />
                            </IconButton>
                          </Box>
                        </Box>

                        {quote.provider && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <Avatar sx={{ width: 32, height: 32 }}>
                              <Person />
                            </Avatar>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                {quote.provider.businessName}
                              </Typography>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Rating value={quote.provider.rating} readOnly size="small" />
                                <Typography variant="caption">
                                  ({quote.provider.totalReviews})
                                </Typography>
                              </Box>
                            </Box>
                          </Box>
                        )}

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          {quote.description}
                        </Typography>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                          <Typography variant="h6" color="primary">
                            ${quote.estimatedPrice}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {(quote.estimatedDuration / 60).toFixed(1)} hours
                          </Typography>
                        </Box>

                        <Typography variant="body2" sx={{ mb: 2 }}>
                          Valid until: {format(new Date(quote.validUntil), 'MMM dd, yyyy')}
                        </Typography>

                        {quote.status === 'pending' && (
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              startIcon={<CheckCircle />}
                              onClick={() => handleAcceptQuote(quote)}
                              disabled={updateQuoteStatusMutation.isPending}
                            >
                              Accept
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              startIcon={<Cancel />}
                              onClick={() => handleRejectQuote(quote)}
                              disabled={updateQuoteStatusMutation.isPending}
                            >
                              Reject
                            </Button>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </TabPanel>
        </>
      )}

      {user?.userType === 'provider' && (
        <>
          {/* Available Quote Requests for Providers */}
          <TabPanel value={tabValue} index={0}>
            {availableRequests?.data?.length === 0 ? (
              <Alert severity="info">
                No available quote requests at the moment. Check back later for new opportunities.
              </Alert>
            ) : (
              <Grid container spacing={3}>
                {availableRequests?.data?.map((request) => (
                  <Grid xs={12} md={6} key={request.id}>
                    <Card>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                          <Typography variant="h6">
                            {formatServiceName(request.serviceType)}
                          </Typography>
                          <Chip 
                            label={request.urgency.toUpperCase()} 
                            size="small" 
                            color={getUrgencyColor(request.urgency) as any}
                          />
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          {request.description}
                        </Typography>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <LocationOn sx={{ fontSize: 'small' }} />
                          <Typography variant="body2">
                            {request.location.city}, {request.location.state}
                          </Typography>
                        </Box>

                        {request.budget && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <AttachMoney sx={{ fontSize: 'small' }} />
                            <Typography variant="body2">
                              Budget: ${request.budget.min} - ${request.budget.max}
                            </Typography>
                          </Box>
                        )}

                        <Typography variant="body2" sx={{ mb: 2 }}>
                          Quotes received: {request.quotesReceived}
                        </Typography>

                        <Button
                          variant="contained"
                          startIcon={<Send />}
                          onClick={() => {
                            setSelectedRequest(request);
                            setShowSubmissionDialog(true);
                          }}
                          fullWidth
                        >
                          Submit Quote
                        </Button>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </TabPanel>

          {/* Provider's Submitted Quotes */}
          <TabPanel value={tabValue} index={1}>
            {quotes?.data?.length === 0 ? (
              <Alert severity="info">
                You haven't submitted any quotes yet. Look for available quote requests to get started.
              </Alert>
            ) : (
              <Grid container spacing={3}>
                {quotes?.data?.map((quote) => (
                  <Grid xs={12} md={6} key={quote.id}>
                    <Card>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                          <Typography variant="h6">
                            {formatServiceName(quote.serviceType)}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip 
                              label={quote.status.toUpperCase()} 
                              size="small" 
                              color={getStatusColor(quote.status) as any}
                            />
                            <IconButton
                              size="small"
                              onClick={(e) => handleMenuClick(e, quote)}
                            >
                              <MoreVert />
                            </IconButton>
                          </Box>
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          {quote.description}
                        </Typography>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                          <Typography variant="h6" color="primary">
                            ${quote.estimatedPrice}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {(quote.estimatedDuration / 60).toFixed(1)} hours
                          </Typography>
                        </Box>

                        <Typography variant="body2" sx={{ mb: 2 }}>
                          Submitted: {format(new Date(quote.createdAt), 'MMM dd, yyyy')}
                        </Typography>

                        <Typography variant="body2">
                          Valid until: {format(new Date(quote.validUntil), 'MMM dd, yyyy')}
                        </Typography>

                        {quote.status === 'pending' && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            startIcon={<Delete />}
                            onClick={() => handleWithdrawQuote(quote)}
                            disabled={updateQuoteStatusMutation.isPending}
                            sx={{ mt: 2 }}
                          >
                            Withdraw Quote
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </TabPanel>
        </>
      )}

      {/* Quote Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => { /* View details */ handleMenuClose(); }}>
          <Visibility sx={{ mr: 1 }} />
          View Details
        </MenuItem>
        {selectedQuote?.status === 'pending' && user?.userType === 'provider' && (
          <MenuItem onClick={() => { handleWithdrawQuote(selectedQuote); }}>
            <Delete sx={{ mr: 1 }} />
            Withdraw Quote
          </MenuItem>
        )}
      </Menu>

      {/* Quote Comparison Dialog */}
      <Dialog
        open={showCompareDialog}
        onClose={() => setShowCompareDialog(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Compare Quotes</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            {quotesToCompare.map((quote) => (
              <Grid xs={12} md={4} key={quote.id}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                      {quote.provider?.businessName || 'Provider'}
                    </Typography>
                    
                    <Typography variant="h4" color="primary" sx={{ mb: 1 }}>
                      ${quote.estimatedPrice}
                    </Typography>
                    
                    <Typography variant="body2" sx={{ mb: 2 }}>
                      {quote.estimatedDuration} hours • ${(quote.estimatedPrice / quote.estimatedDuration).toFixed(2)}/hour
                    </Typography>

                    {quote.provider && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <Rating value={quote.provider.rating} readOnly size="small" />
                        <Typography variant="body2">
                          ({quote.provider.totalReviews} reviews)
                        </Typography>
                      </Box>
                    )}

                    <Typography variant="body2" color="text.secondary">
                      {quote.description}
                    </Typography>

                    {quote.status === 'pending' && (
                      <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => {
                            handleAcceptQuote(quote);
                            setShowCompareDialog(false);
                          }}
                          fullWidth
                        >
                          Accept
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          onClick={() => {
                            handleRejectQuote(quote);
                            setShowCompareDialog(false);
                          }}
                          fullWidth
                        >
                          Reject
                        </Button>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCompareDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Quote Request Dialog */}
      <QuoteRequestDialog
        open={showRequestDialog}
        onClose={() => setShowRequestDialog(false)}
      />

      {/* Quote Submission Dialog */}
      <QuoteSubmissionDialog
        open={showSubmissionDialog}
        onClose={() => setShowSubmissionDialog(false)}
        quoteRequest={selectedRequest}
      />
    </Container>
  );
};

export default MyQuotesPage;