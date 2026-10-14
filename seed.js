// Fills your Atlas collection with sample restaurants so the site has something to show.
//   npm run seed            -> only seeds when the collection is empty
//   npm run seed -- --force -> wipes the collection first, then seeds
require('dotenv').config();
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
dns.promises.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const Restaurant = require('./models/Restaurant');

const { MONGODB_URI } = process.env;
const DB_NAME = process.env.DB_NAME || 'dbRestaurants';
const force = process.argv.includes('--force');

// [name, country (stored in the "borough" field), cuisine, building, street, zipcode]
const SPOTS = [
  // ---- Philippines ----
  ['Jollibee', 'Philippines', 'Fast Food', 'SM Mall of Asia', 'Seaside Boulevard', '1300'],
  ['Chowking', 'Philippines', 'Chinese', 'SM City North EDSA', 'North Avenue', '1105'],
  ['Mang Inasal', 'Philippines', 'Filipino', 'Robinsons Place Manila', 'Pedro Gil Street', '1000'],
  ['Greenwich Pizza', 'Philippines', 'Pizza', 'Glorietta', 'Ayala Center', '1224'],
  ["Max's Restaurant", 'Philippines', 'Filipino', 'Main Branch', 'Scout Tuason Street', '1103'],
  ['Red Ribbon', 'Philippines', 'Bakery', 'SM Megamall', 'EDSA', '1550'],
  ['Goldilocks Bakeshop', 'Philippines', 'Bakery', 'Greenhills Shopping Center', 'Ortigas Avenue', '1500'],
  ['Mary Grace Cafe', 'Philippines', 'Café/Coffee/Tea', 'Greenbelt 3', 'Ayala Center', '1224'],
  ["Gerry's Grill", 'Philippines', 'Filipino', 'Ayala Malls The 30th', 'Meralco Avenue', '1605'],
  ['Yellow Cab Pizza', 'Philippines', 'Pizza', 'Bonifacio High Street', '9th Avenue', '1634'],
  ['Binalot', 'Philippines', 'Filipino', 'Eastwood Mall', 'Eastwood Avenue', '1110'],
  ['Army Navy Burger + Burrito', 'Philippines', 'Hamburgers', 'Robinsons Galleria', 'EDSA', '1110'],
  ["Conti's Bakeshop & Restaurant", 'Philippines', 'Bakery', 'Market! Market!', 'McKinley Parkway', '1634'],
  ["Shakey's Pizza", 'Philippines', 'Pizza', 'Main Branch', 'Tomas Morato Avenue', '1103'],

  // ---- USA ----
  ['Jollibee', 'USA', 'Fast Food', 'Daly City, CA', 'Junipero Serra Boulevard', '94014'],
  ['Chowking', 'USA', 'Chinese', 'Los Angeles, CA', 'Temple Street', '90026'],
  ['Red Ribbon', 'USA', 'Bakery', 'Carson, CA', 'Avalon Boulevard', '90745'],
  ["Max's Restaurant", 'USA', 'Filipino', 'Glendale, CA', 'Brand Boulevard', '91203'],
  ['Potato Corner', 'USA', 'Fast Food', 'Jersey City, NJ', 'Newark Avenue', '07306'],

  // ---- Canada ----
  ['Jollibee', 'Canada', 'Fast Food', 'Toronto, ON', 'Bloor Street West', 'M6G'],
  ['Red Ribbon', 'Canada', 'Bakery', 'Toronto, ON', 'Eglinton Avenue', 'M4P'],
  ['Potato Corner', 'Canada', 'Fast Food', 'Mississauga, ON', 'Hurontario Street', 'L5B'],

  // ---- UAE ----
  ['Jollibee', 'UAE', 'Fast Food', 'Dubai', 'Al Rigga Road', 'N/A'],
  ['Chowking', 'UAE', 'Chinese', 'Dubai', 'Al Muraqqabat Road', 'N/A'],
  ["Max's Restaurant", 'UAE', 'Filipino', 'Dubai', 'Sheikh Zayed Road', 'N/A'],
  ['Red Ribbon', 'UAE', 'Bakery', 'Abu Dhabi', 'Hamdan Street', 'N/A'],

  // ---- UK ----
  ['Jollibee', 'UK', 'Fast Food', 'London', "Earl's Court Road", 'SW5'],

  // ---- Singapore ----
  ['Jollibee', 'Singapore', 'Fast Food', 'Lucky Plaza', 'Orchard Road', '238863'],
  ['Red Ribbon', 'Singapore', 'Bakery', 'Lucky Plaza', 'Orchard Road', '238863'],
  ['Potato Corner', 'Singapore', 'Fast Food', 'Bugis Junction', 'Victoria Street', '188021'],
];

// Small deterministic random generator so every seed run gives the same data.
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function makeGrades(seed) {
  const r = rng(seed * 7 + 11);
  const count = 4 + Math.floor(r() * 4); // 4 to 7 inspections
  const grades = [];
  let date = new Date('2014-03-20T00:00:00Z');
  for (let i = 0; i < count; i++) {
    const score = 3 + Math.floor(r() * 26);
    grades.push({ date: new Date(date), grade: score <= 13 ? 'A' : score <= 27 ? 'B' : 'C', score });
    date = new Date(date.getTime() - (150 + Math.floor(r() * 150)) * 24 * 3600 * 1000);
  }
  return grades;
}

async function run() {
  if (!MONGODB_URI) {
    console.error('Missing MONGODB_URI. Copy .env.example to .env first.');
    process.exit(1);
  }
  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  const existing = await Restaurant.countDocuments();

  if (existing > 0 && !force) {
    console.log(`"${DB_NAME}" already has ${existing} restaurants. Nothing seeded. Use --force to replace them.`);
  } else {
    if (force) await Restaurant.deleteMany({});
    const docs = SPOTS.map(([name, borough, cuisine, building, street, zipcode], i) => ({
      name,
      borough,
      cuisine,
      address: { building, street, zipcode },
      grades: makeGrades(i + 1),
      restaurant_id: String(40000000 + i),
    }));
    await Restaurant.insertMany(docs);
    console.log(`Seeded ${docs.length} sample restaurants into "${DB_NAME}".`);
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});