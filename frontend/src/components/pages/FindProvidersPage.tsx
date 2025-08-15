import React, { useState, useEffect } from 'react';
import { apiService, Provider } from '../../services/api';

const FindProvidersPage: React.FC = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [filters, setFilters] = useState({
    serviceType: '',
    radius: 25,
    minRating: 0
  });
  const [location, setLocation] = useState<{ lat: number; lng: number }>({ lat: 40.7128, lng: -74.0060 });

  const serviceTypes = [
    'house_cleaning',
    'plumbing', 
    'electrical',
    'carpentry',
    'painting',
    'gardening',
    'hvac',
    'appliance_repair'
  ];

  useEffect(() => {
    loadProviders();
  }, [filters, location]);

  const loadProviders = async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {
        lat: location.lat,
        lng: location.lng,
        radius: filters.radius
      };
      
      if (filters.serviceType) {
        params.service_type = filters.serviceType;
      }

      const response = await apiService.getProviders(params);
      let filteredProviders = response.data || [];

      if (filters.minRating > 0) {
        filteredProviders = filteredProviders.filter((p: any) => p.rating >= filters.minRating);
      }

      setProviders(filteredProviders);
    } catch (error: any) {
      setError(error.message || 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const requestQuote = async (providerId: number) => {
    // This would open a quote request modal/form
    alert(`Quote request feature for provider ${providerId} - Integration pending`);
  };

  const bookNow = async (providerId: number) => {
    // This would open a booking form
    alert(`Booking feature for provider ${providerId} - Integration pending`);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '30px', color: '#2c3e50' }}>Find Service Providers</h1>

      {/* Filters */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '30px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ marginBottom: '15px', color: '#34495e' }}>Filter Providers</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Service Type:
            </label>
            <select
              value={filters.serviceType}
              onChange={(e) => handleFilterChange('serviceType', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }}
            >
              <option value="">All Services</option>
              {serviceTypes.map(type => (
                <option key={type} value={type}>
                  {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Radius: {filters.radius} miles
            </label>
            <input
              type="range"
              min="5"
              max="50"
              value={filters.radius}
              onChange={(e) => handleFilterChange('radius', parseInt(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Minimum Rating:
            </label>
            <select
              value={filters.minRating}
              onChange={(e) => handleFilterChange('minRating', parseFloat(e.target.value))}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }}
            >
              <option value="0">Any Rating</option>
              <option value="3">3+ Stars</option>
              <option value="4">4+ Stars</option>
              <option value="4.5">4.5+ Stars</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>Loading providers...</p>
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
              {providers.length} Provider{providers.length !== 1 ? 's' : ''} Found
            </h3>
          </div>

          {providers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p>No providers found matching your criteria. Try adjusting your filters.</p>
            </div>
          ) : (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', 
              gap: '20px' 
            }}>
              {providers.map((provider) => (
                <div key={provider.id} style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '20px',
                  backgroundColor: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '15px' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ color: '#2c3e50', marginBottom: '5px' }}>
                        {provider.businessName}
                      </h3>
                      <div style={{ color: '#7f8c8d', marginBottom: '10px' }}>
                        Provider Name
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ color: '#f39c12', marginRight: '5px' }}>⭐</span>
                        <span style={{ fontWeight: 'bold' }}>{provider.rating}</span>
                        <span style={{ color: '#7f8c8d', marginLeft: '5px' }}>
                          ({provider.totalReviews} reviews)
                        </span>
                      </div>
                    </div>
                  </div>

                  <p style={{ color: '#555', marginBottom: '15px', lineHeight: '1.4' }}>
                    {provider.description}
                  </p>

                  <div style={{ marginBottom: '15px' }}>
                    <strong>Services: </strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '5px' }}>
                      {Array.isArray(provider.services) ? provider.services.map((service, index) => (
                        <span key={index} style={{
                          backgroundColor: '#ecf0f1',
                          padding: '4px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          color: '#2c3e50'
                        }}>
                          {service.replace(/_/g, ' ')}
                        </span>
                      )) : 'N/A'}
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <strong>Rate: </strong>
                    <span style={{ color: '#27ae60', fontWeight: 'bold' }}>
                      ${provider.pricing?.baseRate || 50}/hour
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => requestQuote(parseInt(provider.id))}
                      style={{
                        flex: 1,
                        padding: '10px',
                        backgroundColor: '#3498db',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Request Quote
                    </button>
                    <button
                      onClick={() => bookNow(parseInt(provider.id))}
                      style={{
                        flex: 1,
                        padding: '10px',
                        backgroundColor: '#27ae60',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Book Now
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

export default FindProvidersPage;