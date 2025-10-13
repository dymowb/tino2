import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tab,
  Tabs,
  TextField,
  InputAdornment,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  Fab,
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Receipt as ReceiptIcon,
  Payment as PaymentIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  MoreVert as MoreVertIcon,
  AccountBalance as EscrowIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import apiService from '../../services/api';
import { format } from 'date-fns';
import PaymentDialog from '../payments/PaymentDialog';
import RefundDialog from '../payments/RefundDialog';

interface Payment {
  id: string;
  bookingId: string;
  customerId: string;
  providerId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';
  paymentMethod: {
    type: string;
    last4?: string;
    brand?: string;
  };
  escrowStatus: 'held' | 'released' | 'disputed';
  platformFee: number;
  providerAmount: number;
  description?: string;
  createdAt: string;
  confirmedAt?: string;
  metadata?: Record<string, any>;
  booking?: {
    id: string;
    serviceType: string;
    customer: {
      firstName: string;
      lastName: string;
    };
    provider: {
      businessName: string;
    };
  };
}

const PaymentsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentTab, setCurrentTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || '');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [payments, setPayments] = useState<Payment[]>([]);

  const currentUser = apiService.getStoredUser();
  const isProvider = currentUser?.userType === 'provider';

  const { data: paymentsData, isLoading, refetch } = useQuery({
    queryKey: ['payments', currentTab, statusFilter],
    queryFn: () => {
      const params = {
        status: statusFilter || undefined,
        page: 1,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'desc' as const,
      };

      if (currentTab === 0) {
        return apiService.getPayments(params);
      } else if (currentTab === 1) {
        return apiService.getCustomerPayments(currentUser!.id, params);
      } else {
        return apiService.getProviderPayments(currentUser!.id, params);
      }
    },
    enabled: !!currentUser,
  });

  useEffect(() => {
    if (paymentsData?.data) {
      const data = paymentsData.data as any;
      setPayments(Array.isArray(data) ? data : (data.payments || []));
    }
  }, [paymentsData]);

  const filteredPayments = payments.filter(payment => {
    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    const booking = payment.booking;

    return (
      payment.id.toLowerCase().includes(searchLower) ||
      payment.description?.toLowerCase().includes(searchLower) ||
      booking?.serviceType?.toLowerCase().includes(searchLower) ||
      booking?.customer?.firstName?.toLowerCase().includes(searchLower) ||
      booking?.customer?.lastName?.toLowerCase().includes(searchLower) ||
      booking?.provider?.businessName?.toLowerCase().includes(searchLower)
    );
  });

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const handleStatusFilterChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    // Update URL parameters
    if (newStatus) {
      searchParams.set('status', newStatus);
    } else {
      searchParams.delete('status');
    }
    setSearchParams(searchParams);
  };

  const handlePaymentMenuClick = (event: React.MouseEvent<HTMLElement>, payment: Payment) => {
    setMenuAnchorEl(event.currentTarget);
    setSelectedPayment(payment);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setSelectedPayment(null);
  };

  const handleViewDetails = () => {
    if (selectedPayment) {
      // Open payment details dialog
      console.log('View payment details:', selectedPayment.id);
    }
    handleMenuClose();
  };

  const handleInitiateRefund = () => {
    if (selectedPayment) {
      setRefundDialogOpen(true);
    }
    handleMenuClose();
  };

  const handleDownloadReceipt = () => {
    if (selectedPayment) {
      // Generate and download receipt
      console.log('Download receipt for payment:', selectedPayment.id);
    }
    handleMenuClose();
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'warning',
      processing: 'info',
      succeeded: 'success',
      failed: 'error',
      cancelled: 'default',
      refunded: 'secondary',
    };
    return colors[status as keyof typeof colors] || 'default';
  };

  const getEscrowStatusColor = (status: string) => {
    const colors = {
      held: 'warning',
      released: 'success',
      disputed: 'error',
    };
    return colors[status as keyof typeof colors] || 'default';
  };

  const formatAmount = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount / 100);
  };

  const renderPaymentStats = () => {
    const stats = payments.reduce(
      (acc, payment) => {
        acc.total += payment.amount;
        acc.count += 1;
        if (payment.status === 'succeeded') {
          acc.successful += payment.amount;
          acc.successCount += 1;
        }
        if (payment.escrowStatus === 'held') {
          acc.escrow += payment.amount;
        }
        return acc;
      },
      { total: 0, count: 0, successful: 0, successCount: 0, escrow: 0 }
    );

    return (
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <PaymentIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Total Payments</Typography>
              </Box>
              <Typography variant="h4">{stats.count}</Typography>
              <Typography variant="body2" color="text.secondary">
                {formatAmount(stats.total)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ReceiptIcon color="success" sx={{ mr: 1 }} />
                <Typography variant="h6">Successful</Typography>
              </Box>
              <Typography variant="h4">{stats.successCount}</Typography>
              <Typography variant="body2" color="text.secondary">
                {formatAmount(stats.successful)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <EscrowIcon color="warning" sx={{ mr: 1 }} />
                <Typography variant="h6">In Escrow</Typography>
              </Box>
              <Typography variant="h4">
                {payments.filter(p => p.escrowStatus === 'held').length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatAmount(stats.escrow)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <DownloadIcon color="info" sx={{ mr: 1 }} />
                <Typography variant="h6">Platform Fees</Typography>
              </Box>
              <Typography variant="h4">
                {formatAmount(payments.reduce((acc, p) => acc + p.platformFee, 0))}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total collected
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          {isProvider ? 'Payment Management' : 'Payment History'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            startIcon={<RefreshIcon />}
            onClick={() => refetch()}
            variant="outlined"
          >
            Refresh
          </Button>
          <Button
            startIcon={<DownloadIcon />}
            variant="outlined"
          >
            Export
          </Button>
        </Box>
      </Box>

      {renderPaymentStats()}

      <Card>
        <CardContent>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs value={currentTab} onChange={handleTabChange}>
              <Tab label="All Payments" />
              {!isProvider && <Tab label="My Purchases" />}
              {isProvider && <Tab label="My Earnings" />}
            </Tabs>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <TextField
              size="small"
              placeholder="Search payments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
              sx={{ flexGrow: 1 }}
            />
            
            <TextField
              select
              size="small"
              label="Status"
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="">All Status</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="processing">Processing</MenuItem>
              <MenuItem value="succeeded">Succeeded</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
              <MenuItem value="refunded">Refunded</MenuItem>
            </TextField>
          </Box>

          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Payment ID</TableCell>
                  <TableCell>Service</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Escrow</TableCell>
                  <TableCell>Payment Method</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      Loading payments...
                    </TableCell>
                  </TableRow>
                ) : filteredPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No payments found
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPayments.map((payment) => (
                    <TableRow key={payment.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {payment.id.substring(0, 12)}...
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2">
                            {payment.booking?.serviceType || payment.description}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {isProvider
                              ? `${payment.booking?.customer?.firstName} ${payment.booking?.customer?.lastName}`
                              : payment.booking?.provider?.businessName
                            }
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            {formatAmount(payment.amount, payment.currency)}
                          </Typography>
                          {payment.platformFee > 0 && (
                            <Typography variant="caption" color="text.secondary">
                              Fee: {formatAmount(payment.platformFee, payment.currency)}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={payment.status}
                          color={getStatusColor(payment.status) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={payment.escrowStatus}
                          color={getEscrowStatusColor(payment.escrowStatus) as any}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2">
                            {payment.paymentMethod.type === 'card' 
                              ? `${payment.paymentMethod.brand} ****${payment.paymentMethod.last4}`
                              : payment.paymentMethod.type
                            }
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {format(new Date(payment.createdAt), 'MMM d, yyyy')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {format(new Date(payment.createdAt), 'HH:mm')}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          onClick={(e) => handlePaymentMenuClick(e, payment)}
                        >
                          <MoreVertIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Floating Action Button for new payments (customers only) */}
      {!isProvider && (
        <Fab
          color="primary"
          sx={{ position: 'fixed', bottom: 24, right: 24 }}
          onClick={() => setPaymentDialogOpen(true)}
        >
          <AddIcon />
        </Fab>
      )}

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleViewDetails}>
          <ReceiptIcon sx={{ mr: 1 }} fontSize="small" />
          View Details
        </MenuItem>
        <MenuItem onClick={handleDownloadReceipt}>
          <DownloadIcon sx={{ mr: 1 }} fontSize="small" />
          Download Receipt
        </MenuItem>
        {selectedPayment?.status === 'succeeded' && selectedPayment?.escrowStatus === 'held' && (
          <MenuItem onClick={handleInitiateRefund}>
            <RefreshIcon sx={{ mr: 1 }} fontSize="small" />
            Initiate Refund
          </MenuItem>
        )}
      </Menu>

      {/* Payment Dialog */}
      <PaymentDialog
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        onPaymentSuccess={() => {
          setPaymentDialogOpen(false);
          refetch();
        }}
      />

      {/* Refund Dialog */}
      {selectedPayment && (
        <RefundDialog
          open={refundDialogOpen}
          onClose={() => setRefundDialogOpen(false)}
          payment={selectedPayment}
          onRefundSuccess={() => {
            setRefundDialogOpen(false);
            refetch();
          }}
        />
      )}
    </Box>
  );
};

export default PaymentsPage;