require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/club_management';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'club-management-dev-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGODB_URI, collectionName: 'sessions' }),
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 }
}));
app.use(express.static(path.join(__dirname, 'public')));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, default: '' },
  password_hash: { type: String, required: true },
  role: { type: String, enum: ['student', 'club_staff', 'admin'], default: 'student' },
  created_at: { type: Date, default: Date.now }
});
const clubSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, default: 'ทั่วไป' },
  description: { type: String, required: true },
  owner_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  created_at: { type: Date, default: Date.now }
});
const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  club_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Club', required: true },
  event_date: { type: Date, required: true },
  location: { type: String, default: '' },
  description: { type: String, default: '' },
  created_at: { type: Date, default: Date.now }
});
const membershipSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  club_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Club', required: true },
  status: { type: String, enum: ['approved', 'cancelled'], default: 'approved' },
  joined_at: { type: Date, default: Date.now }
});
membershipSchema.index({ user_id: 1, club_id: 1 }, { unique: true });
const registrationSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  registered_at: { type: Date, default: Date.now }
});
registrationSchema.index({ user_id: 1, event_id: 1 }, { unique: true });
const User = mongoose.model('User', userSchema);
const Club = mongoose.model('Club', clubSchema);
const Event = mongoose.model('Event', eventSchema);
const Membership = mongoose.model('Membership', membershipSchema);
const EventRegistration = mongoose.model('EventRegistration', registrationSchema);

function publicUser(user) {
  return { id: user._id, username: user.username, name: user.name, email: user.email, role: user.role };
}
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ message: 'เฉพาะ Admin เท่านั้น' });
  next();
}
function requireStaffOrAdmin(req, res, next) {
  if (!req.session.user || !['admin', 'club_staff'].includes(req.session.user.role)) return res.status(403).json({ message: 'เฉพาะผู้ดูแลชมรมหรือ Admin เท่านั้น' });
  next();
}
async function canManageClub(req, clubId) {
  if (req.session.user?.role === 'admin') return true;
  if (req.session.user?.role !== 'club_staff') return false;
  return !!(await Club.exists({ _id: clubId, owner_user_id: req.session.user.id }));
}

app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));
app.post('/api/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    req.session.user = publicUser(user);
    res.json({ message: 'เข้าสู่ระบบสำเร็จ', user: req.session.user });
  } catch (e) { res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' }); }
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ message: 'ออกจากระบบแล้ว' })));
app.put('/api/profile', requireLogin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');
    if (!name) return res.status(400).json({ message: 'กรุณากรอกชื่อที่แสดง' });
    const user = await User.findById(req.session.user.id);
    if (!user) return res.status(404).json({ message: 'ไม่พบบัญชีผู้ใช้' });
    user.name = name;
    user.email = email;
    if (password) {
      if (password.length < 4) return res.status(400).json({ message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' });
      user.password_hash = await bcrypt.hash(password, 10);
    }
    await user.save();
    req.session.user = publicUser(user);
    res.json({ message: 'บันทึกโปรไฟล์สำเร็จ', user: req.session.user });
  } catch (e) { res.status(500).json({ message: 'บันทึกโปรไฟล์ไม่สำเร็จ' }); }
});
app.post('/api/register', async (req, res) => {
  try {
    const { username, name, email, password } = req.body;
    if (!username || !name || !password) return res.status(400).json({ message: 'กรอกชื่อผู้ใช้ ชื่อ และรหัสผ่านให้ครบ' });
    if (String(password).length < 4) return res.status(400).json({ message: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' });
    if (await User.findOne({ username: String(username).trim() })) return res.status(409).json({ message: 'ชื่อผู้ใช้นี้มีแล้ว' });
    const user = await User.create({ username: String(username).trim(), name: String(name).trim(), email: email || '', password_hash: await bcrypt.hash(String(password), 10), role: 'student' });
    req.session.user = publicUser(user);
    res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ', user: req.session.user });
  } catch (e) { res.status(500).json({ message: 'สมัครสมาชิกไม่สำเร็จ' }); }
});

app.get('/api/clubs', async (req, res) => {
  try { res.json(await Club.find().sort({ name: 1 })); } catch (e) { res.status(500).json({ message: 'โหลดข้อมูลชมรมไม่สำเร็จ' }); }
});
app.post('/api/clubs', requireAdmin, async (req, res) => {
  try {
    const { name, category, description } = req.body;
    if (!name || !description) return res.status(400).json({ message: 'กรอกชื่อชมรมและรายละเอียด' });
    res.status(201).json(await Club.create({ name, category: category || 'ทั่วไป', description }));
  } catch (e) { res.status(500).json({ message: 'เพิ่มชมรมไม่สำเร็จ' }); }
});
app.delete('/api/clubs/:id', requireAdmin, async (req, res) => {
  try {
    const club = await Club.findByIdAndDelete(req.params.id);
    if (!club) return res.status(404).json({ message: 'ไม่พบชมรม' });
    await Membership.deleteMany({ club_id: club._id });
    const events = await Event.find({ club_id: club._id }).select('_id');
    await EventRegistration.deleteMany({ event_id: { $in: events.map(x => x._id) } });
    await Event.deleteMany({ club_id: club._id });
    res.json({ message: 'ลบชมรมแล้ว' });
  } catch (e) { res.status(400).json({ message: 'ลบชมรมไม่สำเร็จ' }); }
});
app.get('/api/events', async (req, res) => {
  try { res.json(await Event.find().populate('club_id', 'name').sort({ event_date: 1 })); } catch (e) { res.status(500).json({ message: 'โหลดกิจกรรมไม่สำเร็จ' }); }
});
app.post('/api/events', requireStaffOrAdmin, async (req, res) => {
  try {
    const { title, club_id, event_date, location, description } = req.body;
    if (!title || !club_id || !event_date) return res.status(400).json({ message: 'กรอกชื่อกิจกรรม ชมรม และวันที่' });
    if (!await canManageClub(req, club_id)) return res.status(403).json({ message: 'คุณเพิ่มกิจกรรมได้เฉพาะชมรมที่รับผิดชอบ' });
    res.status(201).json(await Event.create({ title, club_id, event_date, location: location || '', description: description || '' }));
  } catch (e) { res.status(400).json({ message: 'เพิ่มกิจกรรมไม่สำเร็จ ตรวจสอบข้อมูลอีกครั้ง' }); }
});
app.delete('/api/events/:id', requireStaffOrAdmin, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'ไม่พบกิจกรรม' });
    if (!await canManageClub(req, event.club_id)) return res.status(403).json({ message: 'คุณไม่มีสิทธิ์ลบกิจกรรมนี้' });
    await Event.findByIdAndDelete(req.params.id);
    await EventRegistration.deleteMany({ event_id: req.params.id });
    res.json({ message: 'ลบกิจกรรมแล้ว' });
  } catch (e) { res.status(400).json({ message: 'ลบกิจกรรมไม่สำเร็จ' }); }
});
app.post('/api/clubs/:id/join', requireLogin, async (req, res) => {
  try {
    const club = await Club.findById(req.params.id);
    if (!club) return res.status(404).json({ message: 'ไม่พบชมรม' });
    const existing = await Membership.findOne({ user_id: req.session.user.id, status: 'approved' });
    if (existing && String(existing.club_id) !== String(club._id)) {
      const existingClub = await Club.findById(existing.club_id).select('name');
      return res.status(409).json({ message: `คุณเป็นสมาชิกชมรม${existingClub?.name || 'อื่น'}แล้ว กรุณาออกจากชมรมเดิมก่อนสมัครชมรมใหม่` });
    }
    await Membership.findOneAndUpdate({ user_id: req.session.user.id, club_id: club._id }, { status: 'approved' }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ message: 'สมัครเข้าชมรมสำเร็จ' });
  } catch (e) { res.status(500).json({ message: 'สมัครเข้าชมรมไม่สำเร็จ' }); }
});
app.get('/api/my-memberships', requireLogin, async (req, res) => {
  const rows = await Membership.find({ user_id: req.session.user.id, status: 'approved' }).populate('club_id');
  res.json(rows);
});
app.delete('/api/clubs/:id/leave', requireLogin, async (req, res) => {
  try {
    const result = await Membership.findOneAndUpdate(
      { user_id: req.session.user.id, club_id: req.params.id, status: 'approved' },
      { status: 'cancelled' }, { new: true }
    );
    if (!result) return res.status(404).json({ message: 'คุณไม่ได้เป็นสมาชิกชมรมนี้' });
    res.json({ message: 'ออกจากชมรมเรียบร้อยแล้ว' });
  } catch (e) { res.status(400).json({ message: 'ออกจากชมรมไม่สำเร็จ' }); }
});
app.get('/api/my-registrations', requireLogin, async (req, res) => {
  try {
    const rows = await EventRegistration.find({ user_id: req.session.user.id })
      .populate({ path: 'event_id', populate: { path: 'club_id', select: 'name' } })
      .sort({ registered_at: -1 });
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'โหลดกิจกรรมของฉันไม่สำเร็จ' }); }
});
app.delete('/api/events/:id/register', requireLogin, async (req, res) => {
  try {
    const result = await EventRegistration.findOneAndDelete({ user_id: req.session.user.id, event_id: req.params.id });
    if (!result) return res.status(404).json({ message: 'คุณยังไม่ได้ลงทะเบียนกิจกรรมนี้' });
    res.json({ message: 'ยกเลิกการลงทะเบียนกิจกรรมแล้ว' });
  } catch (e) { res.status(400).json({ message: 'ยกเลิกกิจกรรมไม่สำเร็จ' }); }
});
app.post('/api/events/:id/register', requireLogin, async (req, res) => {
  try {
    if (!await Event.findById(req.params.id)) return res.status(404).json({ message: 'ไม่พบกิจกรรม' });
    await EventRegistration.create({ user_id: req.session.user.id, event_id: req.params.id });
    res.json({ message: 'ลงทะเบียนกิจกรรมสำเร็จ' });
  } catch (e) { res.status(409).json({ message: 'คุณลงทะเบียนกิจกรรมนี้แล้ว หรือข้อมูลไม่ถูกต้อง' }); }
});
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  res.json((await User.find().select('-password_hash').sort({ created_at: -1 })).map(publicUser));
});

app.put('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const { role, club_id } = req.body;
    if (!['student', 'club_staff', 'admin'].includes(role)) return res.status(400).json({ message: 'บทบาทไม่ถูกต้อง' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'ไม่พบบัญชีผู้ใช้' });
    if (user._id.equals(req.session.user.id) && role !== 'admin') return res.status(400).json({ message: 'ไม่สามารถลดสิทธิ์บัญชีที่กำลังใช้งานได้' });
    if (role === 'club_staff') {
      if (!club_id || !await Club.findById(club_id)) return res.status(400).json({ message: 'กรุณาเลือกชมรมที่ต้องการมอบหมาย' });
      await Club.updateMany({ owner_user_id: user._id }, { $set: { owner_user_id: null } });
      await Club.findByIdAndUpdate(club_id, { owner_user_id: user._id });
    } else {
      await Club.updateMany({ owner_user_id: user._id }, { $set: { owner_user_id: null } });
    }
    user.role = role;
    await user.save();
    res.json({ message: 'อัปเดตบทบาทสำเร็จ', user: publicUser(user) });
  } catch (e) { res.status(400).json({ message: 'อัปเดตบทบาทไม่สำเร็จ' }); }
});

app.get('/api/staff/club', requireStaffOrAdmin, async (req, res) => {
  try {
    if (req.session.user.role === 'admin') return res.json(await Club.find().sort({ name: 1 }));
    const club = await Club.findOne({ owner_user_id: req.session.user.id });
    res.json(club ? [club] : []);
  } catch (e) { res.status(500).json({ message: 'โหลดชมรมที่รับผิดชอบไม่สำเร็จ' }); }
});

app.get('/api/staff/clubs/:id/members', requireStaffOrAdmin, async (req, res) => {
  try {
    if (!await canManageClub(req, req.params.id)) return res.status(403).json({ message: 'คุณไม่มีสิทธิ์จัดการชมรมนี้' });
    const rows = await Membership.find({ club_id: req.params.id, status: 'approved' }).populate('user_id', 'username name email role').sort({ joined_at: -1 });
    res.json(rows.filter(row => row.user_id).map(row => ({ membership_id: row._id, joined_at: row.joined_at, user: publicUser(row.user_id) })));
  } catch (e) { res.status(400).json({ message: 'โหลดรายชื่อสมาชิกไม่สำเร็จ' }); }
});

app.delete('/api/staff/clubs/:clubId/members/:userId', requireStaffOrAdmin, async (req, res) => {
  try {
    if (!await canManageClub(req, req.params.clubId)) return res.status(403).json({ message: 'คุณไม่มีสิทธิ์จัดการชมรมนี้' });
    const result = await Membership.findOneAndUpdate(
      { club_id: req.params.clubId, user_id: req.params.userId, status: 'approved' },
      { status: 'cancelled' }, { new: true }
    );
    if (!result) return res.status(404).json({ message: 'ไม่พบสมาชิกในชมรมนี้' });
    res.json({ message: 'นำสมาชิกออกจากชมรมแล้ว' });
  } catch (e) { res.status(400).json({ message: 'นำสมาชิกออกไม่สำเร็จ' }); }
});

app.put('/api/events/:id', requireStaffOrAdmin, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'ไม่พบกิจกรรม' });
    if (!await canManageClub(req, event.club_id)) return res.status(403).json({ message: 'คุณไม่มีสิทธิ์จัดการกิจกรรมนี้' });
    const { title, event_date, location, description } = req.body;
    if (title) event.title = String(title).trim();
    if (event_date) event.event_date = event_date;
    event.location = location || '';
    event.description = description || '';
    await event.save();
    res.json({ message: 'แก้ไขกิจกรรมสำเร็จ', event });
  } catch (e) { res.status(400).json({ message: 'แก้ไขกิจกรรมไม่สำเร็จ' }); }
});

async function seedDatabase() {
  let admin = await User.findOne({ username: String(process.env.ADMIN_USERNAME || 'Toon').trim() });
  if (!admin) {
    admin = await User.create({
      username: String(process.env.ADMIN_USERNAME || 'Toon').trim(),
      name: 'Administrator', email: 'admin@example.com',
      password_hash: await bcrypt.hash(String(process.env.ADMIN_PASSWORD || '1234'), 10), role: 'admin'
    });
    console.log('Created default Admin account.');
  } else if (admin.role !== 'admin') {
    admin.role = 'admin';
    await admin.save();
    console.log('Updated configured account role to admin.');
  }
  if (await Club.countDocuments() === 0) {
    await Club.insertMany([
      { name: 'ชมรมคอมพิวเตอร์', category: 'เทคโนโลยี', description: 'เรียนรู้การเขียนโปรแกรม พัฒนาเว็บไซต์ และเทคโนโลยีใหม่ ๆ' },
      { name: 'ชมรมดนตรี', category: 'ศิลปะ', description: 'รวมผู้ที่สนใจดนตรี การเล่นเครื่องดนตรี และการแสดง' },
      { name: 'ชมรมกีฬา', category: 'กีฬา', description: 'ส่งเสริมสุขภาพ การออกกำลังกาย และน้ำใจนักกีฬา' },
      { name: 'ชมรมถ่ายภาพ', category: 'ศิลปะ', description: 'ฝึกถ่ายภาพและแบ่งปันเทคนิคการถ่ายภาพ' },
      { name: 'ชมรมภาษาอังกฤษ', category: 'การเรียนรู้', description: 'ฝึกภาษาอังกฤษผ่านกิจกรรมและการสนทนา' },
      { name: 'ชมรมอาสาพัฒนา', category: 'อาสาสมัคร', description: 'ทำกิจกรรมเพื่อชุมชนและสังคม' },
      { name: 'ชมรมสิ่งแวดล้อม', category: 'สิ่งแวดล้อม', description: 'เรียนรู้การดูแลสิ่งแวดล้อมและลดขยะ' },
      { name: 'ชมรมเกมและอีสปอร์ต', category: 'เทคโนโลยี', description: 'แลกเปลี่ยนความรู้เรื่องเกมและการแข่งขันอย่างสร้างสรรค์' },
      { name: 'ชมรมศิลปะ', category: 'ศิลปะ', description: 'สร้างสรรค์ผลงานวาดภาพและงานออกแบบ' },
      { name: 'ชมรมอ่านหนังสือ', category: 'การเรียนรู้', description: 'แลกเปลี่ยนหนังสือและส่งเสริมการอ่าน' },
      { name: 'ชมรมธุรกิจและผู้ประกอบการ', category: 'อาชีพ', description: 'เรียนรู้การทำธุรกิจและการสร้างแนวคิดใหม่' },
      { name: 'ชมรมท่องเที่ยว', category: 'กิจกรรม', description: 'เรียนรู้วัฒนธรรมและการท่องเที่ยวอย่างรับผิดชอบ' }
    ]);
    console.log('Seeded 12 sample clubs.');
  }
  if (await Event.countDocuments() === 0) {
    const clubs = await Club.find().limit(12);
    const titles = ['ปฐมนิเทศสมาชิกใหม่', 'เวิร์กช็อปพื้นฐาน', 'กิจกรรมแบ่งปันความรู้', 'พบปะสมาชิกชมรม', 'กิจกรรมสร้างสรรค์', 'อบรมทักษะเบื้องต้น', 'กิจกรรมอาสา', 'งานแสดงผลงาน', 'การแข่งขันกระชับมิตร', 'แลกเปลี่ยนประสบการณ์', 'กิจกรรมพัฒนาทักษะ', 'สรุปกิจกรรมประจำเดือน'];
    await Event.insertMany(clubs.map((club, i) => ({ title: titles[i], club_id: club._id, event_date: new Date(Date.now() + (i + 1) * 86400000), location: 'มหาวิทยาลัย', description: `กิจกรรมของ${club.name}` })));
    console.log('Seeded sample events.');
  }
}

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    await seedDatabase();
    app.listen(PORT, () => console.log(`Club Management System running at http://localhost:${PORT}`));
  })
  .catch(err => { console.error('MongoDB connection failed:', err.message); process.exit(1); });
