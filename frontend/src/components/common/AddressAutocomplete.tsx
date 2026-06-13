import React, { useState, useEffect, useRef } from 'react';
import { Autocomplete, TextField, CircularProgress, InputAdornment } from '@mui/material';
import { CheckCircle, LocationOn } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { apiService } from '../../services/api';

export interface ResolvedAddress {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  latitude: number;
  longitude: number;
}

interface Prediction { description: string; placeId: string; }

interface Props {
  /** Current address text (controlled by parent). */
  value: string;
  /** True once the address has been resolved to real coordinates. */
  resolved: boolean;
  /** Fired when an address resolves to precise coords (pick or geocode). */
  onResolved: (loc: ResolvedAddress) => void;
  /** Fired on free-text edits — parent should clear the resolved coords. */
  onTextChange: (text: string) => void;
  label?: string;
  error?: boolean;
  helperText?: string;
  required?: boolean;
}

/**
 * Address field with Google Places typeahead + validation.
 * - Suggestions come from /locations/autocomplete (needs Places API enabled).
 * - Picking a suggestion resolves precise coords via /locations/resolve-place.
 * - If Places is unavailable, it degrades to a free-text field that is validated
 *   on blur via /locations/geocode (rejecting junk/imprecise matches), so the
 *   "address must be real" guarantee holds regardless.
 */
const AddressAutocomplete: React.FC<Props> = ({
  value, resolved, onResolved, onTextChange, label, error, helperText, required,
}) => {
  const { t } = useTranslation(['common']);
  const [input, setInput] = useState(value);
  const [options, setOptions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { setInput(value); }, [value]);

  // Debounced suggestion fetch.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!input || input.trim().length < 3 || resolved) { setOptions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const preds = await apiService.addressAutocomplete(input);
      setOptions(preds);
      setLoading(false);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [input, resolved]);

  const pick = async (placeId: string) => {
    try {
      setValidating(true);
      const loc = await apiService.resolvePlace(placeId);
      if (loc?.latitude && loc?.longitude) onResolved(loc);
    } catch { /* ignore — user can retype */ }
    finally { setValidating(false); }
  };

  // Fallback validation: geocode the typed text on blur (when no suggestion was
  // picked, e.g. Places disabled). Rejects junk (partial/APPROXIMATE) matches.
  const validateFreeText = async () => {
    if (resolved || !input || input.trim().length < 5) return;
    try {
      setValidating(true);
      const geo = await apiService.geocodeAddress(input);
      const loc = geo?.location;
      if (loc?.latitude && loc?.longitude && !geo.partialMatch && geo.locationType !== 'APPROXIMATE') {
        onResolved({
          address: loc.address || input,
          city: loc.city || '', state: loc.state || '', zipCode: loc.zipCode || '',
          latitude: loc.latitude, longitude: loc.longitude,
        });
      }
    } catch { /* leave unresolved → parent shows validation error */ }
    finally { setValidating(false); }
  };

  return (
    <Autocomplete
      freeSolo
      filterOptions={(x) => x}            // server already filtered
      options={options}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.description)}
      inputValue={input}
      loading={loading}
      onInputChange={(_e, v) => { setInput(v); onTextChange(v); }}
      onChange={(_e, v) => { if (v && typeof v !== 'string') pick(v.placeId); }}
      renderInput={(params) => (
        <TextField
          {...params}
          fullWidth
          required={required}
          label={label}
          placeholder={t('common:address.placeholder')}
          error={error}
          helperText={helperText}
          onBlur={validateFreeText}
          InputProps={{
            ...params.InputProps,
            startAdornment: <InputAdornment position="start"><LocationOn fontSize="small" color="action" /></InputAdornment>,
            endAdornment: (
              <>
                {(loading || validating) && <CircularProgress size={18} />}
                {resolved && !loading && !validating && <CheckCircle fontSize="small" color="success" />}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
};

export default AddressAutocomplete;
