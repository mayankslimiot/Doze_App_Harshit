/**
 * Analytics Service
 * Tracks user events and interactions
 * Can be extended to integrate with analytics providers (Firebase, Mixpanel, etc.)
 */

type AnalyticsEvent = 
  | 'contact_support_opened'
  | 'contact_support_email_clicked'
  | 'contact_support_website_clicked'
  | 'contact_support_linkedin_clicked';

/**
 * Track an analytics event
 * @param event - Event name
 * @param properties - Optional event properties
 */
export function trackEvent(event: AnalyticsEvent, properties?: Record<string, any>) {
  try {
    // Log to console for debugging
    console.log(`[Analytics] ${event}`, properties || {});
    
    // TODO: Integrate with analytics provider (Firebase Analytics, Mixpanel, etc.)
    // Example:
    // if (__DEV__) {
    //   console.log(`[Analytics] ${event}`, properties);
    // } else {
    //   analytics().logEvent(event, properties);
    // }
  } catch (error) {
    console.error(`[Analytics] Failed to track event: ${event}`, error);
  }
}
