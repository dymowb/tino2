import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface QuoteRequest {
  id: number;
  service_type: string;
  description: string;
  address: string;
  preferred_date: string;
  estimated_budget: number;
  status: string;
  customer_name: string;
  created_at: string;
}

interface Quote {
  id: number;
  quote_request_id: number;
  total_price: number;
  estimated_duration: number;
  description: string;
  valid_until: string;
  status: string;
  created_at: string;
  provider_name?: string;
  business_name?: string;
}

const QuoteManagementPage: React.FC = () => {
  const { user } = useAuth();
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequest[]>([]);
  const [receivedQuotes, setReceivedQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'requests' | 'quotes'>('requests');

  useEffect(() => {
    loadQuoteData();
  }, [user]);

  const loadQuoteData = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      
      if (user?.userType === 'provider') {
        // For providers: load quote requests they can respond to
        // This would be a filtered list of open quote requests in their service area
        const mockQuoteRequests: QuoteRequest[] = [
          {
            id: 1,
            service_type: 'house_cleaning',
            description: 'Need deep cleaning for 3-bedroom apartment. Looking for someone reliable.',
            address: '123 Main St, New York, NY',
            preferred_date: '2024-01-20T10:00:00.000Z',
            estimated_budget: 150,
            status: 'open',
            customer_name: 'John Smith',
            created_at: '2024-01-15T09:00:00.000Z'
          },
          {
            id: 2,
            service_type: 'plumbing',
            description: 'Kitchen sink is leaking and needs repair. Urgent.',
            address: '456 Oak Ave, Brooklyn, NY',
            preferred_date: '2024-01-18T14:00:00.000Z',
            estimated_budget: 200,
            status: 'open',
            customer_name: 'Sarah Johnson',
            created_at: '2024-01-16T11:30:00.000Z'
          }
        ];
        setQuoteRequests(mockQuoteRequests);
      } else {
        // For customers: load quotes they've received
        const mockReceivedQuotes: Quote[] = [
          {
            id: 1,
            quote_request_id: 1,
            total_price: 145,
            estimated_duration: 4,
            description: 'Complete deep cleaning including bathrooms, kitchen, and all bedrooms. Eco-friendly products included.',
            valid_until: '2024-01-25T23:59:59.000Z',
            status: 'pending',
            created_at: '2024-01-16T10:30:00.000Z',
            provider_name: 'Jane Smith',
            business_name: 'Elite Clean Services'
          },
          {
            id: 2,
            quote_request_id: 1,
            total_price: 160,
            estimated_duration: 5,
            description: 'Deep cleaning service with carpet steam cleaning and window cleaning included.',
            valid_until: '2024-01-24T23:59:59.000Z',
            status: 'pending',
            created_at: '2024-01-16T14:15:00.000Z',
            provider_name: 'Mike Wilson',
            business_name: 'Pro Clean Solutions'
          }
        ];
        setReceivedQuotes(mockReceivedQuotes);
      }
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const submitQuote = (requestId: number) => {
    // This would open a quote submission form
    alert(`Submit quote for request ${requestId} - Form integration pending`);
  };

  const acceptQuote = (quoteId: number) => {
    // This would accept the quote and create a booking
    alert(`Accept quote ${quoteId} - Integration pending`);
  };

  const declineQuote = (quoteId: number) => {
    // This would decline the quote
    alert(`Decline quote ${quoteId} - Integration pending`);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return '#3498db';
      case 'pending': return '#f39c12';
      case 'accepted': return '#27ae60';
      case 'declined': return '#e74c3c';
      case 'expired': return '#7f8c8d';
      default: return '#7f8c8d';
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '30px', color: '#2c3e50' }}>
        {user?.userType === 'provider' ? 'Quote Requests' : 'My Quotes'}
      </h1>

      {/* Tab Navigation for customers */}
      {user?.userType === 'customer' && (
        <div style={{ 
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '30px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setActiveTab('requests')}
              style={{
                padding: '10px 20px',
                backgroundColor: activeTab === 'requests' ? '#3498db' : '#ecf0f1',
                color: activeTab === 'requests' ? 'white' : '#2c3e50',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              My Requests
            </button>
            <button
              onClick={() => setActiveTab('quotes')}
              style={{
                padding: '10px 20px',
                backgroundColor: activeTab === 'quotes' ? '#3498db' : '#ecf0f1',
                color: activeTab === 'quotes' ? 'white' : '#2c3e50',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Received Quotes
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>Loading quotes...</p>
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
          {/* Provider View: Quote Requests */}
          {user?.userType === 'provider' && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ color: '#34495e' }}>
                  {quoteRequests.length} Open Quote Request{quoteRequests.length !== 1 ? 's' : ''}
                </h3>
              </div>

              {quoteRequests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <p>No open quote requests in your area.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {quoteRequests.map((request) => (
                    <div key={request.id} style={{
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      padding: '20px',
                      backgroundColor: 'white',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                        <div>
                          <h3 style={{ color: '#2c3e50', marginBottom: '5px' }}>
                            {request.service_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </h3>
                          <p style={{ color: '#7f8c8d', margin: '0' }}>
                            Request #{request.id} • {request.customer_name}
                          </p>
                        </div>
                        <span style={{
                          backgroundColor: getStatusColor(request.status),
                          color: 'white',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          textTransform: 'capitalize'
                        }}>
                          {request.status}
                        </span>
                      </div>

                      <div style={{ marginBottom: '15px' }}>
                        <strong>📝 Description:</strong>
                        <p style={{ margin: '5px 0', color: '#555' }}>{request.description}</p>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                        <div>
                          <strong>📍 Location:</strong>
                          <p style={{ margin: '5px 0' }}>{request.address}</p>
                        </div>
                        <div>
                          <strong>📅 Preferred Date:</strong>
                          <p style={{ margin: '5px 0' }}>{formatDate(request.preferred_date)}</p>
                        </div>
                        <div>
                          <strong>💰 Budget:</strong>
                          <p style={{ margin: '5px 0' }}>${request.estimated_budget}</p>
                        </div>
                        <div>
                          <strong>📊 Posted:</strong>
                          <p style={{ margin: '5px 0' }}>{formatDate(request.created_at)}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => submitQuote(request.id)}
                        style={{
                          padding: '12px 24px',
                          backgroundColor: '#27ae60',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 'bold'
                        }}
                      >
                        Submit Quote
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Customer View: Received Quotes */}
          {user?.userType === 'customer' && activeTab === 'quotes' && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ color: '#34495e' }}>
                  {receivedQuotes.length} Quote{receivedQuotes.length !== 1 ? 's' : ''} Received
                </h3>
              </div>

              {receivedQuotes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <p>No quotes received yet.</p>
                  <p>Submit a quote request to get competitive quotes from providers!</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {receivedQuotes.map((quote) => (
                    <div key={quote.id} style={{
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      padding: '20px',
                      backgroundColor: 'white',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                        <div>
                          <h3 style={{ color: '#2c3e50', marginBottom: '5px' }}>
                            {quote.business_name}
                          </h3>
                          <p style={{ color: '#7f8c8d', margin: '0' }}>
                            by {quote.provider_name}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#27ae60', marginBottom: '5px' }}>
                            ${quote.total_price}
                          </div>
                          <span style={{
                            backgroundColor: getStatusColor(quote.status),
                            color: 'white',
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            textTransform: 'capitalize'
                          }}>
                            {quote.status}
                          </span>
                        </div>
                      </div>

                      <div style={{ marginBottom: '15px' }}>
                        <strong>📝 Quote Details:</strong>
                        <p style={{ margin: '5px 0', color: '#555' }}>{quote.description}</p>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                        <div>
                          <strong>⏱️ Duration:</strong>
                          <p style={{ margin: '5px 0' }}>{quote.estimated_duration} hours</p>
                        </div>
                        <div>
                          <strong>⏰ Valid Until:</strong>
                          <p style={{ margin: '5px 0' }}>{formatDate(quote.valid_until)}</p>
                        </div>
                        <div>
                          <strong>📊 Submitted:</strong>
                          <p style={{ margin: '5px 0' }}>{formatDate(quote.created_at)}</p>
                        </div>
                      </div>

                      {quote.status === 'pending' && (
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            onClick={() => acceptQuote(quote.id)}
                            style={{
                              padding: '12px 24px',
                              backgroundColor: '#27ae60',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontWeight: 'bold'
                            }}
                          >
                            Accept Quote
                          </button>
                          <button
                            onClick={() => declineQuote(quote.id)}
                            style={{
                              padding: '12px 24px',
                              backgroundColor: '#e74c3c',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontWeight: 'bold'
                            }}
                          >
                            Decline
                          </button>
                          <button
                            onClick={() => alert('Message provider feature integration pending')}
                            style={{
                              padding: '12px 24px',
                              backgroundColor: '#3498db',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontWeight: 'bold'
                            }}
                          >
                            Message Provider
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Customer View: Quote Requests */}
          {user?.userType === 'customer' && activeTab === 'requests' && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <h3>Request a Quote</h3>
              <p>Submit a quote request to get competitive quotes from service providers in your area.</p>
              <button
                onClick={() => alert('Quote request form integration pending')}
                style={{
                  padding: '15px 30px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '16px'
                }}
              >
                Create Quote Request
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default QuoteManagementPage;