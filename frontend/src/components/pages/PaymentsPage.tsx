import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['payments']);
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

      if (currentTab === 0 || isProvider) {
        return apiService.getPayments(params);
      } else {
        return apiService.getCustomerPayments(currentUser!.id, params);
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
    // Status filter
    if (statusFilter && payment.status !== statusFilter) {
      return false;
    }

    // Search term filter
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

  const formatAmount = (amount: number, currency = 'BRL') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  const renderPaymentStats = () => {
    const stats = payments.reduce(
      (acc, payment) => {
        const amt = Number(payment.amount);
        acc.total += amt;
        acc.count += 1;
        if (payment.status === 'succeeded') {
          acc.successful += amt;
          acc.successCount += 1;
        }
        if (payment.escrowStatus === 'held') {
          acc.escrow += amt;
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
                <Typography variant="h6">{t('payments:stats.total_payments')}</Typography>
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
                <Typography variant="h6">{t('payments:stats.successful')}</Typography>
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
                <Typography variant="h6">{t('payments:stats.in_escrow')}</Typography>
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
                <Typography variant="h6">{t('payments:stats.platform_fees')}</Typography>
              </Box>
              <Typography variant="h4">
                {formatAmount(payments.reduce((acc, p) => acc + Number(p.platformFee), 0))}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('payments:stats.total_collected')}
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
          {isProvider ? t('payments:payment_management') : t('payments:payment_history')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            startIcon={<RefreshIcon />}
            onClick={() => refetch()}
            variant="outlined"
          >
            {t('payments:refresh')}
          </Button>
          <Button
            startIcon={<DownloadIcon />}
            variant="outlined"
          >
            {t('payments:export')}
          </Button>
        </Box>
      </Box>

      {renderPaymentStats()}

      <Card>
        <CardContent>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs value={currentTab} onChange={handleTabChange}>
              <Tab label={t('payments:all_payments')} />
              {!isProvider && <Tab label={t('payments:my_purchases')} />}
              {isProvider && <Tab label={t('payments:my_earnings')} />}
            </Tabs>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <TextField
              size="small"
              placeholder={t('payments:filters.search_placeholder')}
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
              label={t('payments:table.status')}
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="">{t('payments:filters.all_status')}</MenuItem>
              <MenuItem value="pending">{t('payments:status.pending')}</MenuItem>
              <MenuItem value="processing">{t('payments:status.processing')}</MenuItem>
              <MenuItem value="succeeded">{t('payments:status.succeeded')}</MenuItem>
              <MenuItem value="failed">{t('payments:status.failed')}</MenuItem>
              <MenuItem value="cancelled">{t('payments:status.cancelled')}</MenuItem>
              <MenuItem value="refunded">{t('payments:status.refunded')}</MenuItem>
            </TextField>
          </Box>

          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('payments:table.payment_id')}</TableCell>
                  <TableCell>{t('payments:table.service')}</TableCell>
                  <TableCell>{t('payments:table.amount')}</TableCell>
                  <TableCell>{t('payments:table.status')}</TableCell>
                  <TableCell>{t('payments:table.escrow')}</TableCell>
                  <TableCell>{t('payments:table.payment_method')}</TableCell>
                  <TableCell>{t('payments:table.date')}</TableCell>
                  <TableCell align="center">{t('payments:table.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      {t('payments:loading_payments')}
                    </TableCell>
                  </TableRow>
                ) : filteredPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        {t('payments:no_payments_found')}
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
                            {formatAmount(Number(payment.amount), payment.currency)}
                          </Typography>
                          {Number(payment.platformFee) > 0 && (
                            <Typography variant="caption" color="text.secondary">
                              {t('payments:table.fee')}: {formatAmount(Number(payment.platformFee), payment.currency)}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={t(`payments:status.${payment.status}`)}
                          color={getStatusColor(payment.status) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {payment.escrowStatus ? (
                          <Chip
                            label={t(`payments:escrow_status.${payment.escrowStatus}`)}
                            color={getEscrowStatusColor(payment.escrowStatus) as any}
                            size="small"
                            variant="outlined"
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">—</Typography>
                        )}
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
          {t('payments:actions.view_details')}
        </MenuItem>
        <MenuItem onClick={handleDownloadReceipt}>
          <DownloadIcon sx={{ mr: 1 }} fontSize="small" />
          {t('payments:actions.download_receipt')}
        </MenuItem>
        {selectedPayment?.status === 'succeeded' && selectedPayment?.escrowStatus === 'held' && (
          <MenuItem onClick={handleInitiateRefund}>
            <RefreshIcon sx={{ mr: 1 }} fontSize="small" />
            {t('payments:actions.initiate_refund')}
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