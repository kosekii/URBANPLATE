const express = require('express');
const mongoose = require('mongoose');
const Restaurant = require('../models/Restaurant');

const router = express.Router();

const BOROUGHS = ['Philippines', 'USA', 'Canada', 'UAE', 'UK', 'Singapore'];
const GRADES = ['A', 'B', 'C'];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function latestGrade(grades = []) {
  if (!grades.length) return null;
  return grades.reduce((a, b) => (new Date(b.date || 0) > new Date(a.date || 0) ? b : a));
}

// Shape a database document for the browser.
function toClient(d) {
  const g = latestGrade(d.grades);
  const total =
    d.totalScore !== undefined
      ? d.totalScore
      : (d.grades || []).reduce((sum, x) => sum + (Number(x.score) || 0), 0);
  return {
    _id: d._id,
    name: d.name,
    borough: d.borough,
    cuisine: d.cuisine,
    address: {
      building: (d.address && d.address.building) || '',
      street: (d.address && d.address.street) || '',
      zipcode: (d.address && d.address.zipcode) || '',
    },
    grade: g ? { grade: g.grade, score: g.score, date: g.date } : null,
    totalScore: total,
    inspections: (d.grades || []).length,
  };
}

// Validate and normalise the body of POST / PUT requests.
function readBody(body = {}) {
  const errors = [];
  const name = String(body.name || '').trim();
  const cuisine = String(body.cuisine || '').trim();
  const borough = String(body.borough || '').trim();
  const grade = String(body.grade || '').trim().toUpperCase();
  const rawScore = body.score;
  const score = rawScore === '' || rawScore === null || rawScore === undefined ? null : Number(rawScore);

  if (!name) errors.push('Name is required.');
  if (!cuisine) errors.push('Cuisine is required.');
  if (!BOROUGHS.includes(borough)) errors.push('Choose a valid country.');
  if (grade && !GRADES.includes(grade)) errors.push('Grade must be A, B or C.');
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 200)) {
    errors.push('Score must be a number from 0 to 200.');
  }

  return {
    errors,
    value: {
      name,
      cuisine,
      borough,
      address: {
        building: String(body.building || '').trim(),
        street: String(body.street || '').trim(),
        zipcode: String(body.zipcode || '').trim(),
      },
      grade,
      score,
    },
  };
}

function checkId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'That restaurant id is not valid.' });
  }
  next();
}

// ---------- LIST + SEARCH + FILTER ----------
// GET /api/restaurants?q=bakery&field=cuisine&borough=Bronx&page=1&limit=10
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const q = String(req.query.q || '').trim();
    const field = req.query.field === 'cuisine' ? 'cuisine' : 'name';

    const filter = {};
    if (q) filter[field] = { $regex: escapeRegex(q), $options: 'i' };
    if (BOROUGHS.includes(req.query.borough)) filter.borough = req.query.borough;

    const [total, docs] = await Promise.all([
      Restaurant.countDocuments(filter),
      Restaurant.aggregate([
        { $match: filter },
        { $addFields: { rank: { $indexOfArray: [BOROUGHS, '$borough'] } } },
        { $sort: { rank: 1, name: 1, _id: 1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]),
    ]);

    res.json({
      data: docs.map(toClient),
      page,
      pages: Math.max(Math.ceil(total / limit), 1),
      total,
    });
  } catch (err) {
    next(err);
  }
});

// ---------- AUTOCOMPLETE SUGGESTIONS ----------
// GET /api/restaurants/suggest?q=red&field=name&borough=Philippines
router.get('/suggest', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (!q) return res.json({ suggestions: [] });

    const field = req.query.field === 'cuisine' ? 'cuisine' : 'name';
    const filter = { [field]: { $regex: escapeRegex(q), $options: 'i' } };
    if (BOROUGHS.includes(req.query.borough)) filter.borough = req.query.borough;

    const matches = await Restaurant.aggregate([
      { $match: filter },
      { $group: { _id: `$${field}` } },
      { $sort: { _id: 1 } },
      { $limit: 8 },
    ]);
    res.json({ suggestions: matches.map((item) => item._id).filter(Boolean) });
  } catch (err) {
    next(err);
  }
});

// ---------- FEATURED (random picks for the home page) ----------
router.get('/featured', async (req, res, next) => {
  try {
    const docs = await Restaurant.aggregate([
      { $match: { borough: { $in: ['Philippines', 'USA'] }, name: { $nin: ['', null] } } },
      { $group: { _id: '$name', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sample: { size: 4 } },
    ]);
    res.json(docs.map(toClient));
  } catch (err) {
    next(err);
  }
});

// ---------- BEST QUALITY (aggregated score > min) ----------
router.get('/best', async (req, res, next) => {
  try {
    const min = Number(req.query.min);
    const threshold = Number.isFinite(min) ? min : 90;
    const docs = await Restaurant.aggregate([
      { $addFields: { totalScore: { $sum: '$grades.score' } } },
      { $match: { totalScore: { $gt: threshold } } },
      { $sort: { totalScore: -1, name: 1 } },
      { $limit: 12 },
    ]);
    res.json({ threshold, data: docs.map(toClient) });
  } catch (err) {
    next(err);
  }
});

// ---------- STATS (for the borough tiles + about section) ----------
router.get('/stats', async (req, res, next) => {
  try {
    const [total, byBorough, cuisines] = await Promise.all([
      Restaurant.countDocuments(),
      Restaurant.aggregate([{ $group: { _id: '$borough', count: { $sum: 1 } } }]),
      Restaurant.distinct('cuisine'),
    ]);
    const boroughs = {};
    byBorough.forEach((b) => {
      if (BOROUGHS.includes(b._id)) boroughs[b._id] = b.count;
    });
    res.json({ total, cuisines: cuisines.length, boroughs });
  } catch (err) {
    next(err);
  }
});

// ---------- READ ONE ----------
router.get('/:id', checkId, async (req, res, next) => {
  try {
    const doc = await Restaurant.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Restaurant not found.' });
    res.json(toClient(doc));
  } catch (err) {
    next(err);
  }
});

// ---------- ADD ----------
router.post('/', async (req, res, next) => {
  try {
    const { errors, value } = readBody(req.body);
    if (errors.length) return res.status(400).json({ error: errors[0], details: errors });

    const doc = await Restaurant.create({
      name: value.name,
      cuisine: value.cuisine,
      borough: value.borough,
      address: value.address,
      grades: value.grade ? [{ date: new Date(), grade: value.grade, score: value.score ?? 0 }] : [],
      restaurant_id: String(Date.now()),
    });
    res.status(201).json(toClient(doc.toObject()));
  } catch (err) {
    next(err);
  }
});

// ---------- EDIT ----------
router.put('/:id', checkId, async (req, res, next) => {
  try {
    const { errors, value } = readBody(req.body);
    if (errors.length) return res.status(400).json({ error: errors[0], details: errors });

    const doc = await Restaurant.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Restaurant not found.' });

    doc.name = value.name;
    doc.cuisine = value.cuisine;
    doc.borough = value.borough;
    doc.address.building = value.address.building;
    doc.address.street = value.address.street;
    doc.address.zipcode = value.address.zipcode;

    // A changed grade or score is recorded as a new inspection.
    if (value.grade) {
      const current = latestGrade(doc.grades);
      const newScore = value.score ?? 0;
      if (!current || current.grade !== value.grade || current.score !== newScore) {
        doc.grades.push({ date: new Date(), grade: value.grade, score: newScore });
      }
    }

    await doc.save();
    res.json(toClient(doc.toObject()));
  } catch (err) {
    next(err);
  }
});

// ---------- DELETE ----------
router.delete('/:id', checkId, async (req, res, next) => {
  try {
    const doc = await Restaurant.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Restaurant not found.' });
    res.json({ ok: true, _id: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
