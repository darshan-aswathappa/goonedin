"""
Location normalization map for US states.
Maps aliases (abbreviations, full names, city names) to normalized state data.
"""

STATE_DATA = [
    {
        "full_name": "Massachusetts",
        "abbreviation": "MA",
        "cities": [
            "Boston", "Cambridge", "Somerville", "Quincy", "Worcester",
            "Springfield", "Lowell", "Brookline", "Newton", "Waltham",
            "Medford", "Malden", "Framingham", "Natick", "Wellesley",
        ],
    },
    {
        "full_name": "California",
        "abbreviation": "CA",
        "cities": [
            "San Francisco", "Los Angeles", "San Diego", "San Jose",
            "Sacramento", "Oakland", "Palo Alto", "Mountain View",
            "Sunnyvale", "Santa Clara", "Cupertino", "Irvine",
            "Menlo Park", "Redwood City", "Berkeley",
        ],
    },
    {
        "full_name": "New York",
        "abbreviation": "NY",
        "cities": [
            "New York", "Brooklyn", "Manhattan", "Queens", "Bronx",
            "Buffalo", "Rochester", "Albany", "Syracuse", "White Plains",
            "Yonkers", "Ithaca", "Schenectady", "New Rochelle", "Troy",
        ],
    },
    {
        "full_name": "Texas",
        "abbreviation": "TX",
        "cities": [
            "Austin", "Dallas", "Houston", "San Antonio", "Fort Worth",
            "Plano", "Irving", "Arlington", "Frisco", "Richardson",
            "Round Rock", "El Paso", "McKinney", "Addison", "The Woodlands",
        ],
    },
    {
        "full_name": "Washington",
        "abbreviation": "WA",
        "cities": [
            "Seattle", "Bellevue", "Redmond", "Tacoma", "Kirkland",
            "Spokane", "Olympia", "Bothell", "Renton", "Everett",
            "Kennewick", "Vancouver", "Federal Way", "Issaquah", "Sammamish",
        ],
    },
    {
        "full_name": "Illinois",
        "abbreviation": "IL",
        "cities": [
            "Chicago", "Naperville", "Evanston", "Schaumburg", "Aurora",
            "Rockford", "Springfield", "Peoria", "Champaign", "Downers Grove",
            "Oak Brook", "Lincolnshire", "Libertyville", "Lisle", "Wheaton",
        ],
    },
    {
        "full_name": "Colorado",
        "abbreviation": "CO",
        "cities": [
            "Denver", "Boulder", "Colorado Springs", "Fort Collins",
            "Aurora", "Lakewood", "Broomfield", "Littleton", "Englewood",
            "Westminster", "Arvada", "Thornton", "Longmont", "Loveland", "Pueblo",
        ],
    },
    {
        "full_name": "Georgia",
        "abbreviation": "GA",
        "cities": [
            "Atlanta", "Savannah", "Augusta", "Athens", "Sandy Springs",
            "Alpharetta", "Marietta", "Roswell", "Duluth", "Kennesaw",
            "Decatur", "Lawrenceville", "Peachtree City", "Cumming", "Johns Creek",
        ],
    },
    {
        "full_name": "Virginia",
        "abbreviation": "VA",
        "cities": [
            "Arlington", "Richmond", "McLean", "Tysons", "Reston",
            "Herndon", "Fairfax", "Alexandria", "Norfolk", "Virginia Beach",
            "Charlottesville", "Ashburn", "Sterling", "Chantilly", "Leesburg",
        ],
    },
    {
        "full_name": "North Carolina",
        "abbreviation": "NC",
        "cities": [
            "Charlotte", "Raleigh", "Durham", "Greensboro", "Winston-Salem",
            "Cary", "Wilmington", "Asheville", "Chapel Hill", "Morrisville",
            "Fayetteville", "Huntersville", "Concord", "Apex", "Wake Forest",
        ],
    },
    {
        "full_name": "Pennsylvania",
        "abbreviation": "PA",
        "cities": [
            "Philadelphia", "Pittsburgh", "Allentown", "Harrisburg", "Lancaster",
            "King of Prussia", "Conshohocken", "Malvern", "Wayne", "Radnor",
            "Reading", "Erie", "Bethlehem", "Blue Bell", "Fort Washington",
        ],
    },
    {
        "full_name": "Oregon",
        "abbreviation": "OR",
        "cities": [
            "Portland", "Salem", "Eugene", "Beaverton", "Hillsboro",
            "Bend", "Corvallis", "Lake Oswego", "Tigard", "Medford",
            "Gresham", "Tualatin", "Wilsonville", "Clackamas", "Milwaukie",
        ],
    },
    {
        "full_name": "New Jersey",
        "abbreviation": "NJ",
        "cities": [
            "Newark", "Jersey City", "Hoboken", "Princeton", "Trenton",
            "Camden", "Edison", "Parsippany", "Morristown", "New Brunswick",
            "Cherry Hill", "Piscataway", "Red Bank", "Iselin", "Bridgewater",
        ],
    },
    {
        "full_name": "Maryland",
        "abbreviation": "MD",
        "cities": [
            "Baltimore", "Bethesda", "Rockville", "Silver Spring", "Columbia",
            "Annapolis", "Frederick", "College Park", "Gaithersburg", "Towson",
            "Hanover", "Owings Mills", "Hunt Valley", "Bowie", "Ellicott City",
        ],
    },
    {
        "full_name": "Connecticut",
        "abbreviation": "CT",
        "cities": [
            "Hartford", "Stamford", "New Haven", "Bridgeport", "Norwalk",
            "Danbury", "Greenwich", "Waterbury", "Shelton", "Milford",
            "Farmington", "Windsor", "Glastonbury", "Westport", "Darien",
        ],
    },
    {
        "full_name": "Florida",
        "abbreviation": "FL",
        "cities": [
            "Miami", "Tampa", "Orlando", "Jacksonville", "Fort Lauderdale",
            "St. Petersburg", "Boca Raton", "West Palm Beach", "Sarasota",
            "Naples", "Tallahassee", "Gainesville", "Doral", "Coral Gables", "Hollywood",
        ],
    },
    {
        "full_name": "Ohio",
        "abbreviation": "OH",
        "cities": [
            "Columbus", "Cleveland", "Cincinnati", "Dayton", "Akron",
            "Toledo", "Dublin", "Westerville", "Mason", "Blue Ash",
            "Beachwood", "Independence", "Solon", "Hudson", "Youngstown",
        ],
    },
    {
        "full_name": "Michigan",
        "abbreviation": "MI",
        "cities": [
            "Detroit", "Ann Arbor", "Grand Rapids", "Dearborn", "Troy",
            "Lansing", "Kalamazoo", "Southfield", "Auburn Hills", "Novi",
            "Royal Oak", "Farmington Hills", "Livonia", "Plymouth", "Warren",
        ],
    },
    {
        "full_name": "Minnesota",
        "abbreviation": "MN",
        "cities": [
            "Minneapolis", "St. Paul", "Bloomington", "Rochester", "Duluth",
            "Plymouth", "Eagan", "Eden Prairie", "Minnetonka", "Maple Grove",
            "Edina", "St. Louis Park", "Burnsville", "Woodbury", "Brooklyn Park",
        ],
    },
    {
        "full_name": "Arizona",
        "abbreviation": "AZ",
        "cities": [
            "Phoenix", "Scottsdale", "Tempe", "Mesa", "Chandler",
            "Tucson", "Gilbert", "Glendale", "Peoria", "Surprise",
            "Flagstaff", "Goodyear", "Avondale", "Fountain Hills", "Cave Creek",
        ],
    },
    {
        "full_name": "Indiana",
        "abbreviation": "IN",
        "cities": [
            "Indianapolis", "Fort Wayne", "Bloomington", "Carmel", "Fishers",
            "Evansville", "South Bend", "Westfield", "Noblesville", "Zionsville",
            "Lafayette", "Muncie", "Greenwood", "Plainfield", "Kokomo",
        ],
    },
    {
        "full_name": "Missouri",
        "abbreviation": "MO",
        "cities": [
            "St. Louis", "Kansas City", "Springfield", "Columbia", "Independence",
            "Lee's Summit", "O'Fallon", "Chesterfield", "Creve Coeur", "Clayton",
            "St. Charles", "Ballwin", "Maryland Heights", "Bridgeton", "Hazelwood",
        ],
    },
    {
        "full_name": "Tennessee",
        "abbreviation": "TN",
        "cities": [
            "Nashville", "Memphis", "Knoxville", "Chattanooga", "Franklin",
            "Murfreesboro", "Clarksville", "Brentwood", "Hendersonville", "Germantown",
            "Collierville", "Jackson", "Johnson City", "Kingsport", "Smyrna",
        ],
    },
    {
        "full_name": "Wisconsin",
        "abbreviation": "WI",
        "cities": [
            "Milwaukee", "Madison", "Green Bay", "Kenosha", "Racine",
            "Appleton", "Waukesha", "Oshkosh", "Eau Claire", "Brookfield",
            "Wauwatosa", "Fitchburg", "Middleton", "Sun Prairie", "Janesville",
        ],
    },
    {
        "full_name": "Utah",
        "abbreviation": "UT",
        "cities": [
            "Salt Lake City", "Provo", "Lehi", "Draper", "Sandy",
            "Orem", "Ogden", "South Jordan", "West Jordan", "American Fork",
            "Pleasant Grove", "Riverton", "Herriman", "Midvale", "Murray",
        ],
    },
    {
        "full_name": "District of Columbia",
        "abbreviation": "DC",
        "cities": [
            "Washington",
        ],
    },
]

# Common aliases that map to specific states
ALIASES = {
    "nyc": "NY",
    "sf": "CA",
    "bay area": "CA",
    "silicon valley": "CA",
    "dmv": "DC",
    "dfw": "TX",
    "rtp": "NC",
    "research triangle": "NC",
    "socal": "CA",
    "norcal": "CA",
}


def _build_state_map():
    """Build lookup: lowercase key → state data dict with patterns."""
    result = {}
    for state in STATE_DATA:
        abbr = state["abbreviation"]
        full = state["full_name"]
        cities = state["cities"]

        patterns = [
            f", {abbr}",
            f" {abbr},",
            f" {abbr} ",
            f"({abbr})",
            full,
            f"US-{abbr}",
        ]

        entry = {
            "full_name": full,
            "abbreviation": abbr,
            "cities": cities,
            "state_patterns": patterns,
        }

        # Index by abbreviation and full name
        result[abbr.lower()] = entry
        result[full.lower()] = entry

        # Index by city name
        for city in cities:
            city_key = city.lower()
            if city_key not in result:
                result[city_key] = entry

    # Index aliases
    for alias, abbr in ALIASES.items():
        for state in STATE_DATA:
            if state["abbreviation"] == abbr:
                patterns = [
                    f", {abbr}",
                    f" {abbr},",
                    f" {abbr} ",
                    f"({abbr})",
                    state["full_name"],
                    f"US-{abbr}",
                ]
                result[alias] = {
                    "full_name": state["full_name"],
                    "abbreviation": abbr,
                    "cities": state["cities"],
                    "state_patterns": patterns,
                }
                break

    return result


STATE_MAP = _build_state_map()


def normalize_location(raw: str):
    """Look up a raw location string and return normalized data or None."""
    if not raw or not raw.strip():
        return None
    return STATE_MAP.get(raw.strip().lower())
