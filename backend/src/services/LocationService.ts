import { Client } from '@googlemaps/google-maps-services-js';
import config from '../config/environment';
import logger from '../config/logger';

export interface Location {
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface GeocodingResult {
  location: Location;
  placeId: string;
  formattedAddress: string;
  // Precision signals: `partialMatch` true and/or APPROXIMATE location_type mean
  // Google fell back to a region/country centroid (e.g. junk input → Brazil's
  // centroid). Callers validating real addresses should reject those.
  partialMatch?: boolean;
  locationType?: string;
}

export interface DistanceResult {
  distance: number; // in kilometers
  duration: number; // in minutes
  distanceText: string;
  durationText: string;
}

export interface NearbySearchResult {
  results: Array<{
    placeId: string;
    name: string;
    location: Location;
    distance: number;
    rating?: number;
    types: string[];
  }>;
  nextPageToken?: string;
}

export class LocationService {
  private client: Client;

  constructor() {
    this.client = new Client({});
  }

  /**
   * Geocode an address to get coordinates and formatted location data
   */
  async geocodeAddress(address: string): Promise<GeocodingResult> {
    try {
      const response = await this.client.geocode({
        params: {
          address,
          key: config.external.googleMapsApiKey,
        },
      });

      if (response.data.status !== 'OK' || response.data.results.length === 0) {
        throw new Error(`Geocoding failed: ${response.data.status}`);
      }

      const result = response.data.results[0];
      const location = this.parseAddressComponents(result);

      return {
        location: {
          latitude: result.geometry.location.lat,
          longitude: result.geometry.location.lng,
          ...location,
        },
        placeId: result.place_id,
        formattedAddress: result.formatted_address,
        partialMatch: (result as any).partial_match === true,
        locationType: result.geometry.location_type as string,
      };
    } catch (error) {
      logger.error('Geocoding error:', error);
      throw new Error('Failed to geocode address');
    }
  }

  /**
   * Reverse geocode coordinates to get address information
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<GeocodingResult> {
    try {
      const response = await this.client.reverseGeocode({
        params: {
          latlng: { lat: latitude, lng: longitude },
          key: config.external.googleMapsApiKey,
        },
      });

      if (response.data.status !== 'OK' || response.data.results.length === 0) {
        throw new Error(`Reverse geocoding failed: ${response.data.status}`);
      }

      const result = response.data.results[0];
      const location = this.parseAddressComponents(result);

      return {
        location: {
          latitude,
          longitude,
          ...location,
        },
        placeId: result.place_id,
        formattedAddress: result.formatted_address,
      };
    } catch (error) {
      logger.error('Reverse geocoding error:', error);
      throw new Error('Failed to reverse geocode coordinates');
    }
  }

  /**
   * Calculate distance and duration between two points
   */
  async calculateDistance(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    mode: 'driving' | 'walking' | 'transit' = 'driving'
  ): Promise<DistanceResult> {
    try {
      const response = await this.client.distancematrix({
        params: {
          origins: [origin],
          destinations: [destination],
          mode: mode as any,
          units: 'metric' as any,
          key: config.external.googleMapsApiKey,
        },
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Distance calculation failed: ${response.data.status}`);
      }

      const element = response.data.rows[0].elements[0];
      if (element.status !== 'OK') {
        throw new Error(`Distance calculation failed: ${element.status}`);
      }

      return {
        distance: Math.round((element.distance.value / 1000) * 100) / 100, // Convert to km with 2 decimal places
        duration: Math.round(element.duration.value / 60), // Convert to minutes
        distanceText: element.distance.text,
        durationText: element.duration.text,
      };
    } catch (error) {
      logger.error('Distance calculation error:', error);
      throw new Error('Failed to calculate distance');
    }
  }

  /**
   * Calculate distances from one point to multiple destinations
   */
  async calculateDistances(
    origin: { lat: number; lng: number },
    destinations: Array<{ lat: number; lng: number }>,
    mode: 'driving' | 'walking' | 'transit' = 'driving'
  ): Promise<DistanceResult[]> {
    try {
      // Google Maps API has limits, so we batch requests if needed
      const batchSize = 25; // Max destinations per request
      const results: DistanceResult[] = [];

      for (let i = 0; i < destinations.length; i += batchSize) {
        const batch = destinations.slice(i, i + batchSize);

        const response = await this.client.distancematrix({
          params: {
            origins: [origin],
            destinations: batch,
            mode: mode as any,
            units: 'metric' as any,
            key: config.external.googleMapsApiKey,
          },
        });

        if (response.data.status !== 'OK') {
          throw new Error(`Distance calculation failed: ${response.data.status}`);
        }

        const elements = response.data.rows[0].elements;
        for (const element of elements) {
          if (element.status === 'OK') {
            results.push({
              distance: Math.round((element.distance.value / 1000) * 100) / 100,
              duration: Math.round(element.duration.value / 60),
              distanceText: element.distance.text,
              durationText: element.duration.text,
            });
          } else {
            // Add placeholder for failed calculations
            results.push({
              distance: -1,
              duration: -1,
              distanceText: 'N/A',
              durationText: 'N/A',
            });
          }
        }
      }

      return results;
    } catch (error) {
      logger.error('Batch distance calculation error:', error);
      throw new Error('Failed to calculate distances');
    }
  }

  /**
   * Search for nearby places
   */
  async nearbySearch(
    location: { lat: number; lng: number },
    radius: number = 5000, // meters
    type?: string
  ): Promise<NearbySearchResult> {
    try {
      const response = await this.client.placesNearby({
        params: {
          location,
          radius,
          type,
          key: config.external.googleMapsApiKey,
        },
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Nearby search failed: ${response.data.status}`);
      }

      const results = response.data.results.map((place) => ({
        placeId: place.place_id!,
        name: place.name!,
        location: {
          latitude: place.geometry!.location.lat,
          longitude: place.geometry!.location.lng,
          address: place.vicinity || '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
        },
        distance: this.calculateStraightLineDistance(location, {
          lat: place.geometry!.location.lat,
          lng: place.geometry!.location.lng,
        }),
        rating: place.rating,
        types: place.types || [],
      }));

      return {
        results,
        nextPageToken: response.data.next_page_token,
      };
    } catch (error) {
      logger.error('Nearby search error:', error);
      throw new Error('Failed to search nearby places');
    }
  }

  /**
   * Get place details by place ID
   */
  async getPlaceDetails(placeId: string) {
    try {
      const response = await this.client.placeDetails({
        params: {
          place_id: placeId,
          fields: [
            'name',
            'formatted_address',
            'geometry',
            'rating',
            'user_ratings_total',
            'formatted_phone_number',
            'website',
          ],
          key: config.external.googleMapsApiKey,
        },
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Place details failed: ${response.data.status}`);
      }

      return response.data.result;
    } catch (error) {
      logger.error('Place details error:', error);
      throw new Error('Failed to get place details');
    }
  }

  /**
   * Address autocomplete predictions for a typed query. Biased to Brazil so local
   * results rank first. Returns lightweight {description, placeId} — call
   * resolvePlace(placeId) on selection to get precise coords + components.
   */
  async autocomplete(input: string): Promise<Array<{ description: string; placeId: string }>> {
    if (!input || input.trim().length < 3) return [];
    try {
      const response = await this.client.placeAutocomplete({
        params: {
          input,
          components: ['country:br'],
          key: config.external.googleMapsApiKey,
        } as any,
        timeout: 3000, // fail fast
        retryConfig: { retries: 0 } as any, // don't back-off-retry a 403 (Places disabled)
      } as any);
      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new Error(`Autocomplete failed: ${response.data.status}`);
      }
      return (response.data.predictions || []).map((p) => ({
        description: p.description,
        placeId: p.place_id,
      }));
    } catch (error) {
      logger.error('Autocomplete error:', error);
      throw new Error('Failed to fetch address suggestions');
    }
  }

  /**
   * Resolve a place_id (from autocomplete) to a precise, structured address with
   * coordinates. Pulls address_components + geometry so the caller gets the same
   * shape as geocodeAddress (street/city/state/zip/country + lat/lng).
   */
  async resolvePlace(placeId: string): Promise<Location> {
    try {
      const response = await this.client.placeDetails({
        params: {
          place_id: placeId,
          fields: ['address_component', 'geometry', 'formatted_address'],
          key: config.external.googleMapsApiKey,
        },
      });
      if (response.data.status !== 'OK') {
        throw new Error(`Place details failed: ${response.data.status}`);
      }
      const result = response.data.result;
      const parsed = this.parseAddressComponents(result);
      return {
        latitude: result.geometry!.location.lat,
        longitude: result.geometry!.location.lng,
        ...parsed,
      };
    } catch (error) {
      logger.error('Resolve place error:', error);
      throw new Error('Failed to resolve place');
    }
  }

  /**
   * Calculate straight-line distance between two points (Haversine formula)
   */
  calculateStraightLineDistance(
    point1: { lat: number; lng: number },
    point2: { lat: number; lng: number }
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(point2.lat - point1.lat);
    const dLng = this.toRadians(point2.lng - point1.lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(point1.lat)) *
        Math.cos(this.toRadians(point2.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100; // Distance in km with 2 decimal places
  }

  /**
   * Check if a point is within a radius of another point
   */
  isWithinRadius(
    center: { lat: number; lng: number },
    point: { lat: number; lng: number },
    radiusKm: number
  ): boolean {
    const distance = this.calculateStraightLineDistance(center, point);
    return distance <= radiusKm;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private parseAddressComponents(result: any): Omit<Location, 'latitude' | 'longitude'> {
    const components = result.address_components;
    const location: Omit<Location, 'latitude' | 'longitude'> = {
      address: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
    };

    for (const component of components) {
      const types = component.types;

      if (types.includes('street_number') || types.includes('route')) {
        location.address += component.long_name + ' ';
      } else if (types.includes('locality') || types.includes('administrative_area_level_2')) {
        location.city = component.long_name;
      } else if (types.includes('administrative_area_level_1')) {
        location.state = component.short_name;
      } else if (types.includes('postal_code')) {
        location.zipCode = component.long_name;
      } else if (types.includes('country')) {
        location.country = component.long_name;
      }
    }

    location.address = location.address.trim();
    return location;
  }
}

export default new LocationService();
