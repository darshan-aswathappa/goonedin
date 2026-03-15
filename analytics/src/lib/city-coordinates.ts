/**
 * Static city → [longitude, latitude] lookup for the bubble map.
 * Covers all canonical names from CITY_ALIASES in analytics.ts plus common US tech hubs.
 */
export const CITY_COORDS: Record<string, [number, number]> = {
  "New York, NY": [-74.006, 40.7128],
  "San Francisco, CA": [-122.4194, 37.7749],
  "Los Angeles, CA": [-118.2437, 34.0522],
  "Chicago, IL": [-87.6298, 41.8781],
  "Seattle, WA": [-122.3321, 47.6062],
  "Boston, MA": [-71.0589, 42.3601],
  "Austin, TX": [-97.7431, 30.2672],
  "Denver, CO": [-104.9903, 39.7392],
  "Atlanta, GA": [-84.388, 33.749],
  "Washington, DC": [-77.0369, 38.9072],
  "San Jose, CA": [-121.8863, 37.3382],
  "San Diego, CA": [-117.1611, 32.7157],
  "Palo Alto, CA": [-122.143, 37.4419],
  "Menlo Park, CA": [-122.1817, 37.4529],
  "Mountain View, CA": [-122.0838, 37.3861],
  "New Jersey": [-74.4057, 40.0583],
  "Dallas, TX": [-96.797, 32.7767],
  "Houston, TX": [-95.3698, 29.7604],
  "Phoenix, AZ": [-112.074, 33.4484],
  "Philadelphia, PA": [-75.1652, 39.9526],
  "Minneapolis, MN": [-93.265, 44.9778],
  "Portland, OR": [-122.6765, 45.5152],
  "Raleigh, NC": [-78.6382, 35.7796],
  "Salt Lake City, UT": [-111.891, 40.7608],
  "Pittsburgh, PA": [-79.9959, 40.4406],
  "Charlotte, NC": [-80.8431, 35.2271],
  "Nashville, TN": [-86.7816, 36.1627],
  "Detroit, MI": [-83.0458, 42.3314],
  "Miami, FL": [-80.1918, 25.7617],
  "Tampa, FL": [-82.4572, 27.9506],
  "Columbus, OH": [-82.9988, 39.9612],
  "Indianapolis, IN": [-86.1581, 39.7684],
  "Sunnyvale, CA": [-122.0363, 37.3688],
  "Redmond, WA": [-122.1215, 47.674],
  "Boulder, CO": [-105.2705, 40.015],
  "Irvine, CA": [-117.7947, 33.6846],
  "Santa Clara, CA": [-121.9552, 37.3541],
  "Cupertino, CA": [-122.0322, 37.323],
};

/** Bay Area cities that should cluster into "Bay Area, CA" when >3 overlap */
export const BAY_AREA_CITIES = new Set([
  "San Francisco, CA",
  "San Jose, CA",
  "Palo Alto, CA",
  "Menlo Park, CA",
  "Mountain View, CA",
  "Sunnyvale, CA",
  "Santa Clara, CA",
  "Cupertino, CA",
]);

export const BAY_AREA_CENTER: [number, number] = [-122.15, 37.52];
