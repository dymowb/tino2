import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';

interface UserProfile {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  user_type: 'customer' | 'provider';
  phone: string;
  profile_image: string;
  created_at: string;
}

interface ProviderProfile {
  id: number;
  business_name: string;
  description: string;
  services: string[];
  hourly_rate: number;
  latitude: number;
  longitude: number;
  availability_status: 'available' | 'busy' | 'offline';
  rating: number;
  total_reviews: number;
  profile_image: string;
  is_active: boolean;
}

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [providerProfile, setProviderProfile] = useState<ProviderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    businessName: '',
    description: '',
    services: [] as string[],
    hourlyRate: 0,
    availabilityStatus: 'available' as 'available' | 'busy' | 'offline'
  });

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

  const availabilityOptions = [
    { value: 'available', label: 'Available', color: '#27ae60' },
    { value: 'busy', label: 'Busy', color: '#f39c12' },
    { value: 'offline', label: 'Offline', color: '#e74c3c' }
  ];

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    setError('');
    try {
      // Load user profile using API service
      const userInfo = await apiService.getProfile();

      const profileData: any = {
        id: userInfo.id,
        email: userInfo.email,
        first_name: userInfo.firstName || '',
        last_name: userInfo.lastName || '',
        user_type: userInfo.userType || 'customer',
        phone: userInfo.phone || '',
        profile_image: userInfo.profileImage || '',
        created_at: userInfo.createdAt || new Date().toISOString()
      };

      setUserProfile(profileData);
      setFormData(prev => ({
        ...prev,
        firstName: userInfo.firstName || '',
        lastName: userInfo.lastName || '',
        phone: userInfo.phone || ''
      }));

      // Load provider profile if user is a provider
      if (userInfo.userType === 'provider') {
        // Provider profile would be loaded here if endpoint exists
        // For now, we'll skip this as it's not in the API service
      }
    } catch (error: any) {
      setError(error.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleServiceToggle = (service: string) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter(s => s !== service)
        : [...prev.services, service]
    }));
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      // Update user profile using API service
      await apiService.updateProfile({
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone
      });

      // Update provider profile if user is a provider
      // Provider profile updates would go here if endpoint exists

      // Reload profile data
      await loadProfile();
      setEditing(false);

    } catch (error: any) {
      setError(error.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getAvailabilityColor = (status: string) => {
    const option = availabilityOptions.find(opt => opt.value === status);
    return option ? option.color : '#7f8c8d';
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <div style={{ 
          backgroundColor: '#e74c3c', 
          color: 'white', 
          padding: '15px', 
          borderRadius: '4px' 
        }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ color: '#2c3e50', margin: 0 }}>Profile Settings</h1>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Edit Profile
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={saveProfile}
              disabled={saving}
              style={{
                padding: '10px 20px',
                backgroundColor: saving ? '#95a5a6' : '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                loadProfile(); // Reset form data
              }}
              disabled={saving}
              style={{
                padding: '10px 20px',
                backgroundColor: '#95a5a6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Basic Profile Information */}
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ color: '#34495e', marginBottom: '20px' }}>Basic Information</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              First Name:
            </label>
            {editing ? (
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            ) : (
              <p style={{ margin: '0', color: '#555' }}>{userProfile?.first_name}</p>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Last Name:
            </label>
            {editing ? (
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            ) : (
              <p style={{ margin: '0', color: '#555' }}>{userProfile?.last_name}</p>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Email:
            </label>
            <p style={{ margin: '0', color: '#555' }}>{userProfile?.email}</p>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Phone:
            </label>
            {editing ? (
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            ) : (
              <p style={{ margin: '0', color: '#555' }}>{userProfile?.phone || 'Not provided'}</p>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Account Type:
            </label>
            <p style={{ margin: '0', color: '#555', textTransform: 'capitalize' }}>
              {userProfile?.user_type}
            </p>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Member Since:
            </label>
            <p style={{ margin: '0', color: '#555' }}>
              {userProfile?.created_at ? formatDate(userProfile.created_at) : 'Unknown'}
            </p>
          </div>
        </div>
      </div>

      {/* Provider Profile Information */}
      {user?.userType === 'provider' && (
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ color: '#34495e', marginBottom: '20px' }}>Provider Information</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Business Name:
              </label>
              {editing ? (
                <input
                  type="text"
                  value={formData.businessName}
                  onChange={(e) => handleInputChange('businessName', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              ) : (
                <p style={{ margin: '0', color: '#555' }}>{providerProfile?.business_name}</p>
              )}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Hourly Rate:
              </label>
              {editing ? (
                <input
                  type="number"
                  value={formData.hourlyRate}
                  onChange={(e) => handleInputChange('hourlyRate', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              ) : (
                <p style={{ margin: '0', color: '#555' }}>${providerProfile?.hourly_rate}/hour</p>
              )}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Rating:
              </label>
              <p style={{ margin: '0', color: '#555' }}>
                ⭐ {providerProfile?.rating} ({providerProfile?.total_reviews} reviews)
              </p>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Availability:
              </label>
              {editing ? (
                <select
                  value={formData.availabilityStatus}
                  onChange={(e) => handleInputChange('availabilityStatus', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                >
                  {availabilityOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span style={{
                  backgroundColor: getAvailabilityColor(providerProfile?.availability_status || 'offline'),
                  color: 'white',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  textTransform: 'capitalize'
                }}>
                  {providerProfile?.availability_status}
                </span>
              )}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Description:
            </label>
            {editing ? (
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  resize: 'vertical'
                }}
              />
            ) : (
              <p style={{ margin: '0', color: '#555', lineHeight: '1.5' }}>
                {providerProfile?.description || 'No description provided'}
              </p>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
              Services Offered:
            </label>
            {editing ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                {serviceTypes.map(service => (
                  <label key={service} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.services.includes(service)}
                      onChange={() => handleServiceToggle(service)}
                      style={{ marginRight: '8px' }}
                    />
                    {service.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {(providerProfile?.services || []).map((service, index) => (
                  <span key={index} style={{
                    backgroundColor: '#3498db',
                    color: 'white',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    {service.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Account Actions */}
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ color: '#34495e', marginBottom: '20px' }}>Account Actions</h3>
        
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <button
            onClick={() => alert('Change password feature integration pending')}
            style={{
              padding: '10px 20px',
              backgroundColor: '#f39c12',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Change Password
          </button>
          
          <button
            onClick={() => alert('Notification preferences feature integration pending')}
            style={{
              padding: '10px 20px',
              backgroundColor: '#9b59b6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Notification Settings
          </button>
          
          <button
            onClick={() => alert('Privacy settings feature integration pending')}
            style={{
              padding: '10px 20px',
              backgroundColor: '#16a085',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Privacy Settings
          </button>
          
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
                alert('Account deletion feature integration pending');
              }
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;