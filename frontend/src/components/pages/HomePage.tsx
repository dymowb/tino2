import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiService, Provider } from '../../services/api';

const HomePage: React.FC = () => {
  const { user } = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    // Get user's location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error('Error getting location:', error);
          // Use default NYC coordinates
          setLocation({ lat: 40.7128, lng: -74.0060 });
        }
      );
    } else {
      // Use default NYC coordinates
      setLocation({ lat: 40.7128, lng: -74.0060 });
    }
  }, []);

  useEffect(() => {
    if (location) {
      loadNearbyProviders();
    }
  }, [location]);

  const loadNearbyProviders = async () => {
    if (!location) return;
    
    setLoading(true);
    try {
      const response = await apiService.getNearbyProviders({
        lat: location.lat,
        lng: location.lng,
        radius: 25
      });
      setProviders(response.providers);
    } catch (error) {
      console.error('Failed to load providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    if (user) {
      return `Welcome back, ${user.firstName}!`;
    }
    return 'Welcome to Domestic Service App';
  };

  const getUserTypeMessage = () => {
    if (!user) return 'Please login to access all features';
    
    if (user.userType === 'customer') {
      return 'Find trusted service providers near you';
    } else {
      return 'Manage your service business and connect with customers';
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ color: '#2c3e50', marginBottom: '10px' }}>
          {getGreeting()}
        </h1>
        <p style={{ color: '#7f8c8d', fontSize: '18px' }}>
          {getUserTypeMessage()}
        </p>
      </header>

      {user && user.userType === 'customer' && (
        <section>
          <h2 style={{ color: '#34495e', marginBottom: '20px' }}>
            Service Providers Near You
          </h2>
          
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p>Loading nearby providers...</p>
            </div>
          ) : providers.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {providers.map((provider) => (
                <div key={provider.id} style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '20px',
                  backgroundColor: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  <h3 style={{ color: '#2c3e50', marginBottom: '10px' }}>
                    {provider.business_name}
                  </h3>
                  <p style={{ color: '#7f8c8d', marginBottom: '10px' }}>
                    {provider.description}
                  </p>
                  <div style={{ marginBottom: '10px' }}>
                    <strong>Services: </strong>
                    {Array.isArray(provider.services) ? provider.services.join(', ') : 'N/A'}
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <strong>Rate: </strong>${provider.hourly_rate}/hour
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <strong>Rating: </strong>
                    ⭐ {provider.rating} ({provider.total_reviews} reviews)
                  </div>
                  <div style={{ color: '#27ae60' }}>
                    <strong>Contact: </strong>{provider.first_name} {provider.last_name}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p>No service providers found in your area. Try expanding your search radius.</p>
            </div>
          )}
        </section>
      )}

      {user && user.userType === 'provider' && (
        <section>
          <h2 style={{ color: '#34495e', marginBottom: '20px' }}>
            Provider Dashboard
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            <div style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '20px',
              backgroundColor: '#ecf0f1',
              textAlign: 'center'
            }}>
              <h3>Manage Profile</h3>
              <p>Update your business information and services</p>
            </div>
            <div style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '20px',
              backgroundColor: '#ecf0f1',
              textAlign: 'center'
            }}>
              <h3>View Bookings</h3>
              <p>See your upcoming appointments</p>
            </div>
            <div style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '20px',
              backgroundColor: '#ecf0f1',
              textAlign: 'center'
            }}>
              <h3>Quote Requests</h3>
              <p>Respond to customer quote requests</p>
            </div>
          </div>
        </section>
      )}

      {!user && (
        <section style={{ textAlign: 'center', padding: '40px' }}>
          <h2 style={{ color: '#34495e', marginBottom: '20px' }}>
            Get Started Today
          </h2>
          <p style={{ marginBottom: '30px', fontSize: '16px', color: '#7f8c8d' }}>
            Join thousands of customers and service providers already using our platform
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{
              border: '1px solid #3498db',
              borderRadius: '8px',
              padding: '30px',
              backgroundColor: '#ecf0f1',
              maxWidth: '300px'
            }}>
              <h3 style={{ color: '#3498db' }}>For Customers</h3>
              <p>Find trusted service providers for your home needs</p>
              <ul style={{ textAlign: 'left', marginTop: '15px' }}>
                <li>GPS-based provider discovery</li>
                <li>Compare quotes and reviews</li>
                <li>Secure booking and payments</li>
              </ul>
            </div>
            <div style={{
              border: '1px solid #27ae60',
              borderRadius: '8px',
              padding: '30px',
              backgroundColor: '#ecf0f1',
              maxWidth: '300px'
            }}>
              <h3 style={{ color: '#27ae60' }}>For Providers</h3>
              <p>Grow your service business and reach more customers</p>
              <ul style={{ textAlign: 'left', marginTop: '15px' }}>
                <li>Manage your schedule</li>
                <li>Submit competitive quotes</li>
                <li>Build your reputation</li>
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default HomePage;