/**
 * Utility functions for collecting device and network information
 * Used for security tracking in attendance and login systems
 */

/**
 * Get the user's public IP address
 * Uses a free IP lookup service
 * - إذا لم يرد السيرفر خلال 3 ثوانٍ يُكمل بدون IP
 */
export async function getPublicIP(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch('https://api.ipify.org?format=json', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error('Failed to fetch IP');
    }

    const data = await response.json();
    return data.ip || null;
  } catch (error) {
    // انتهى الـ timeout أو فشل الاتصال — يكمل بدون IP بصمت
    return null;
  }
}

/**
 * Get device information from User Agent
 * Returns a formatted string with browser, OS, and device type
 */
export function getDeviceInfo(): string {
  const userAgent = navigator.userAgent;
  
  // Extract browser info
  let browser = 'Unknown';
  if (userAgent.indexOf('Chrome') > -1 && userAgent.indexOf('Edg') === -1) {
    browser = 'Chrome';
  } else if (userAgent.indexOf('Safari') > -1 && userAgent.indexOf('Chrome') === -1) {
    browser = 'Safari';
  } else if (userAgent.indexOf('Firefox') > -1) {
    browser = 'Firefox';
  } else if (userAgent.indexOf('Edg') > -1) {
    browser = 'Edge';
  } else if (userAgent.indexOf('MSIE') > -1 || userAgent.indexOf('Trident') > -1) {
    browser = 'IE';
  }
  
  // Extract OS info
  let os = 'Unknown';
  if (userAgent.indexOf('Win') > -1) {
    os = 'Windows';
  } else if (userAgent.indexOf('Mac') > -1) {
    os = 'macOS';
  } else if (userAgent.indexOf('Linux') > -1) {
    os = 'Linux';
  } else if (userAgent.indexOf('Android') > -1) {
    os = 'Android';
  } else if (userAgent.indexOf('iOS') > -1 || userAgent.indexOf('iPhone') > -1 || userAgent.indexOf('iPad') > -1) {
    os = 'iOS';
  }
  
  // Extract device type
  let deviceType = 'Desktop';
  if (/Mobile|Android|iPhone|iPad|iPod/i.test(userAgent)) {
    deviceType = 'Mobile';
  } else if (/Tablet|iPad/i.test(userAgent)) {
    deviceType = 'Tablet';
  }
  
  // Format: "Chrome on Windows (Desktop)"
  return `${browser} on ${os} (${deviceType})`;
}

/**
 * Get both IP and Device Info in one call
 * Returns an object with both values
 */
export async function getDeviceAndNetworkInfo(): Promise<{
  ipAddress: string | null;
  deviceInfo: string;
}> {
  const [ipAddress, deviceInfo] = await Promise.all([
    getPublicIP(),
    Promise.resolve(getDeviceInfo()),
  ]);
  
  return {
    ipAddress,
    deviceInfo,
  };
}

/**
 * Get full User Agent string (for detailed logging)
 */
export function getUserAgent(): string {
  return navigator.userAgent;
}
