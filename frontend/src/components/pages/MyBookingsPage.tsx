import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface Booking {
  id: number;
  service_type: string;
  scheduled_date: string;
  address: string;
  description: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  payment_status: string;
  other_party: {
    id: number;
    business_name?: string;
    name: string;
    phone: string;
  };
  estimated_duration: number;
  created_at: string;
}

const MyBookingsPage: React.FC = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadBookings();
  }, [filter]);

  const loadBookings = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const response = await fetch(`http://localhost:5000/api/bookings${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load bookings');
      }

      const data = await response.json();
      setBookings(data.bookings || []);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateBookingStatus = async (bookingId: number, newStatus: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        throw new Error('Failed to update booking status');
      }

      // Reload bookings
      loadBookings();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
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
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredBookings = bookings.filter(booking => 
    filter === 'all' || booking.status === filter
  );

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '30px', color: '#2c3e50' }}>My Bookings</h1>

      {/* Filters */}
      <div style={{ 
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '30px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              style={{
                padding: '8px 16px',
                backgroundColor: filter === status ? '#3498db' : '#ecf0f1',
                color: filter === status ? 'white' : '#2c3e50',
                border: 'none',
                borderRadius: '20px',
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {status === 'all' ? 'All Bookings' : status.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>Loading bookings...</p>
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
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ color: '#34495e' }}>
              {filteredBookings.length} Booking{filteredBookings.length !== 1 ? 's' : ''}
              {filter !== 'all' && ` (${filter.replace('_', ' ')})`}
            </h3>
          </div>

          {filteredBookings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p>No bookings found.</p>
              {user?.userType === 'customer' && (
                <p>Start by finding service providers and booking services!</p>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {filteredBookings.map((booking) => (
                <div key={booking.id} style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '20px',
                  backgroundColor: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                    <div>
                      <h3 style={{ color: '#2c3e50', marginBottom: '5px' }}>
                        {booking.service_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </h3>
                      <p style={{ color: '#7f8c8d', margin: '0' }}>
                        Booking #{booking.id}
                      </p>
                    </div>
                    <span style={{
                      backgroundColor: getStatusColor(booking.status),
                      color: 'white',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      textTransform: 'capitalize'
                    }}>
                      {booking.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '15px' }}>
                    <div>
                      <strong>📅 Scheduled:</strong>
                      <p style={{ margin: '5px 0' }}>{formatDate(booking.scheduled_date)}</p>
                      
                      <strong>📍 Address:</strong>
                      <p style={{ margin: '5px 0' }}>{booking.address}</p>
                      
                      <strong>⏱️ Duration:</strong>
                      <p style={{ margin: '5px 0' }}>{booking.estimated_duration} hours</p>
                    </div>
                    <div>
                      <strong>👤 {user?.userType === 'customer' ? 'Provider' : 'Customer'}:</strong>
                      <p style={{ margin: '5px 0' }}>
                        {booking.other_party.business_name || booking.other_party.name}
                      </p>
                      <p style={{ margin: '5px 0', color: '#7f8c8d' }}>
                        📞 {booking.other_party.phone}
                      </p>
                      
                      <strong>💳 Payment:</strong>
                      <p style={{ margin: '5px 0', textTransform: 'capitalize' }}>
                        {booking.payment_status}
                      </p>
                    </div>
                  </div>

                  {booking.description && (
                    <div style={{ marginBottom: '15px' }}>
                      <strong>📝 Description:</strong>
                      <p style={{ margin: '5px 0', color: '#555' }}>{booking.description}</p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {booking.status === 'pending' && user?.userType === 'provider' && (
                      <>
                        <button
                          onClick={() => updateBookingStatus(booking.id, 'confirmed')}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#27ae60',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => updateBookingStatus(booking.id, 'cancelled')}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#e74c3c',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Decline
                        </button>
                      </>
                    )}
                    
                    {booking.status === 'confirmed' && user?.userType === 'provider' && (
                      <button
                        onClick={() => updateBookingStatus(booking.id, 'in_progress')}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#9b59b6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Start Service
                      </button>
                    )}
                    
                    {booking.status === 'in_progress' && user?.userType === 'provider' && (
                      <button
                        onClick={() => updateBookingStatus(booking.id, 'completed')}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#27ae60',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Mark Complete
                      </button>
                    )}

                    {booking.status === 'completed' && user?.userType === 'customer' && (
                      <button
                        onClick={() => alert('Review system integration pending')}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#f39c12',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Leave Review
                      </button>
                    )}

                    <button
                      onClick={() => alert('Messaging system integration pending')}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#3498db',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Message
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MyBookingsPage;