import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import PasswordChangeDialog from '../profile/PasswordChangeDialog';
import AccountDeletionDialog from '../profile/AccountDeletionDialog';
import PrivacySettingsDialog from '../profile/PrivacySettingsDialog';

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
  const { t, i18n } = useTranslation(['profile']);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [providerProfile, setProviderProfile] = useState<ProviderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [deletionDialogOpen, setDeletionDialogOpen] = useState(false);
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);

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
    return new Date(dateString).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'pt-BR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatUserType = (type: string) => t(`common:user_type.${type}`, type);

  const getAvailabilityColor = (status: string) => {
    const option = availabilityOptions.find(opt => opt.value === status);
    return option ? option.color : '#7f8c8d';
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>{t('profile:loading')}</p>
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
        <h1 style={{ color: '#2c3e50', margin: 0 }}>{t('profile:title')}</h1>
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
            {t('profile:edit_profile')}
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
              {saving ? t('profile:saving') : t('profile:save_changes')}
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
              {t('profile:cancel')}
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
        <h3 style={{ color: '#34495e', marginBottom: '20px' }}>{t('profile:sections.basic_information')}</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              {t('profile:fields.first_name')}:
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
              {t('profile:fields.last_name')}:
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
              {t('profile:fields.email')}:
            </label>
            <p style={{ margin: '0', color: '#555' }}>{userProfile?.email}</p>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              {t('profile:fields.phone')}:
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
              <p style={{ margin: '0', color: '#555' }}>{userProfile?.phone || t('profile:fields.not_provided')}</p>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              {t('profile:fields.account_type')}:
            </label>
            <p style={{ margin: '0', color: '#555', textTransform: 'capitalize' }}>
              {formatUserType(userProfile?.user_type || '')}
            </p>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              {t('profile:fields.member_since')}:
            </label>
            <p style={{ margin: '0', color: '#555' }}>
              {userProfile?.created_at ? formatDate(userProfile.created_at) : t('profile:fields.not_provided')}
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
          <h3 style={{ color: '#34495e', marginBottom: '20px' }}>{t('profile:sections.provider_information')}</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                {t('profile:fields.business_name')}:
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
                {t('profile:fields.hourly_rate')}:
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
                {t('profile:fields.rating')}:
              </label>
              <p style={{ margin: '0', color: '#555' }}>
                ⭐ {providerProfile?.rating} ({providerProfile?.total_reviews} {t('profile:fields.reviews')})
              </p>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                {t('profile:fields.availability')}:
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
              {t('profile:fields.description')}:
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
                {providerProfile?.description || t('profile:fields.no_description')}
              </p>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
              {t('profile:fields.services_offered')}:
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
                    {service.replace(/_/g, ' ').replace(/(^|\s)(\S)/g, (_, s, c) => s + c.toUpperCase())}
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
                    {service.replace(/_/g, ' ').replace(/(^|\s)(\S)/g, (_, s, c) => s + c.toUpperCase())}
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
        <h3 style={{ color: '#34495e', marginBottom: '20px' }}>{t('profile:sections.account_actions')}</h3>

        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setPasswordDialogOpen(true)}
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
            {t('profile:password.change_password')}
          </button>

          <button
            onClick={() => navigate('/notifications?tab=settings')}
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
            {t('profile:settings.notification_settings')}
          </button>

          <button
            onClick={() => setPrivacyDialogOpen(true)}
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
            {t('profile:settings.privacy_settings')}
          </button>

          <button
            onClick={() => setDeletionDialogOpen(true)}
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
            {t('profile:delete_account.button')}
          </button>
        </div>
      </div>

      {/* Password Change Dialog */}
      <PasswordChangeDialog
        open={passwordDialogOpen}
        onClose={() => setPasswordDialogOpen(false)}
      />

      {/* Privacy Settings Dialog */}
      <PrivacySettingsDialog
        open={privacyDialogOpen}
        onClose={() => setPrivacyDialogOpen(false)}
      />

      {/* Account Deletion Dialog */}
      <AccountDeletionDialog
        open={deletionDialogOpen}
        onClose={() => setDeletionDialogOpen(false)}
      />
    </div>
  );
};

export default ProfilePage;