import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface DashboardStats {
  totalBookings: number;
  pendingBookings: number;
  completedBookings: number;
  totalEarnings: number;
  avgRating: number;
  totalReviews: number;
}

interface RecentBooking {
  id: number;
  service_type: string;
  scheduled_date: string;
  customer_name: string;
  status: string;
  address: string;
}

const ProviderDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalBookings: 0,
    pendingBookings: 0,
    completedBookings: 0,
    totalEarnings: 0,
    avgRating: 0,
    totalReviews: 0
  });
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (user?.userType === 'provider') {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      
      // Load bookings for statistics
      const bookingsResponse = await fetch('http://localhost:5000/api/bookings', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (bookingsResponse.ok) {
        const bookingsData = await bookingsResponse.json();
        const bookings = bookingsData.bookings || [];
        
        // Calculate stats
        const totalBookings = bookings.length;
        const pendingBookings = bookings.filter((b: any) => b.status === 'pending').length;
        const completedBookings = bookings.filter((b: any) => b.status === 'completed').length;
        
        // Mock earnings calculation (would come from payments API)
        const totalEarnings = completedBookings * 85; // Average earning per job
        
        setStats({
          totalBookings,
          pendingBookings,
          completedBookings,
          totalEarnings,
          avgRating: 4.7, // Would come from provider profile
          totalReviews: completedBookings * 0.8 // Estimate review rate
        });

        // Set recent bookings (last 5)
        setRecentBookings(bookings.slice(0, 5).map((booking: any) => ({
          id: booking.id,
          service_type: booking.service_type,
          scheduled_date: booking.scheduled_date,
          customer_name: booking.other_party?.name || 'Unknown Customer',
          status: booking.status,
          address: booking.address
        })));
      }
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#f39c12';
      case 'confirmed': return '#3498db';
      case 'in_progress': return '#9b59b6';
      case 'completed': return '#27ae60';
      case 'cancelled': return '#e74c3c';
      default: return '#7f8c8d';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (user?.userType !== 'provider') {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Access Denied</h2>
        <p>This page is only available to service providers.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '30px', color: '#2c3e50' }}>Provider Dashboard</h1>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>Loading dashboard...</p>
        </div>
      )}

      {error && (
        <div style={{ 
          backgroundColor: '#e74c3c', 
          color: 'white', 
          padding: '15px', 
          borderRadius: '4px', 
          marginBottom: '20px' 
        }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Stats Cards */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '20px', 
            marginBottom: '40px' 
          }}>
            <div style={{
              backgroundColor: '#3498db',
              color: 'white',
              padding: '20px',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '32px' }}>{stats.totalBookings}</h3>
              <p style={{ margin: '0', opacity: 0.9 }}>Total Bookings</p>
            </div>

            <div style={{
              backgroundColor: '#f39c12',
              color: 'white',
              padding: '20px',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '32px' }}>{stats.pendingBookings}</h3>
              <p style={{ margin: '0', opacity: 0.9 }}>Pending Requests</p>
            </div>

            <div style={{
              backgroundColor: '#27ae60',
              color: 'white',
              padding: '20px',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '32px' }}>{stats.completedBookings}</h3>
              <p style={{ margin: '0', opacity: 0.9 }}>Completed Jobs</p>
            </div>

            <div style={{
              backgroundColor: '#8e44ad',
              color: 'white',
              padding: '20px',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '32px' }}>${stats.totalEarnings}</h3>
              <p style={{ margin: '0', opacity: 0.9 }}>Total Earnings</p>
            </div>

            <div style={{
              backgroundColor: '#e67e22',
              color: 'white',
              padding: '20px',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '32px' }}>⭐ {stats.avgRating}</h3>
              <p style={{ margin: '0', opacity: 0.9 }}>Average Rating</p>
            </div>

            <div style={{
              backgroundColor: '#16a085',
              color: 'white',
              padding: '20px',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '32px' }}>{Math.round(stats.totalReviews)}</h3>
              <p style={{ margin: '0', opacity: 0.9 }}>Customer Reviews</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ 
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '30px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ marginBottom: '20px', color: '#34495e' }}>Quick Actions</h3>
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
              <button
                onClick={() => alert('Update availability feature integration pending')}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                📅 Update Availability
              </button>
              <button
                onClick={() => alert('Edit profile feature integration pending')}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#27ae60',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                ✏️ Edit Profile
              </button>
              <button
                onClick={() => alert('View analytics feature integration pending')}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#8e44ad',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                📊 View Analytics
              </button>
              <button
                onClick={() => alert('Payment settings feature integration pending')}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#e67e22',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                💳 Payment Settings
              </button>
            </div>
          </div>

          {/* Recent Bookings */}
          <div style={{ 
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ marginBottom: '20px', color: '#34495e' }}>Recent Bookings</h3>
            
            {recentBookings.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#7f8c8d', padding: '20px' }}>
                No recent bookings found.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {recentBookings.map((booking) => (
                  <div key={booking.id} style={{
                    border: '1px solid #ecf0f1',
                    borderRadius: '6px',
                    padding: '15px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 5px 0', color: '#2c3e50' }}>
                        {booking.service_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </h4>
                      <p style={{ margin: '0 0 5px 0', color: '#7f8c8d' }}>
                        Customer: {booking.customer_name}
                      </p>
                      <p style={{ margin: '0', color: '#7f8c8d', fontSize: '14px' }}>
                        📍 {booking.address}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: '0 0 5px 0', color: '#555' }}>
                        {formatDate(booking.scheduled_date)}
                      </p>
                      <span style={{
                        backgroundColor: getStatusColor(booking.status),
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        textTransform: 'capitalize'
                      }}>
                        {booking.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ProviderDashboardPage;