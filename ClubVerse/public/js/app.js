const $ = (s) => document.querySelector(s);
let currentUser = null,
  allClubs = [],
  allEvents = [],
  myMemberships = [],
  myRegistrations = [],
  authMode = "login";
let pageHistory = ["home"];
const icons = [
  "💻",
  "🎵",
  "⚽",
  "📷",
  "🌐",
  "🌱",
  "🌎",
  "🎮",
  "🎨",
  "📚",
  "💡",
  "🧭",
];
function esc(v = "") {
  return String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function notice(msg, error = false) {
  const n = $("#notice");
  n.textContent = msg;
  n.classList.toggle("error", error);
  n.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => n.classList.add("hidden"), 4000);
}
async function api(url, options = {}) {
  const r = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || "เกิดข้อผิดพลาด");
  return d;
}
function page(id, track = true) {
  const current = document.querySelector(".page:not(.hidden)")?.id;
  if (track && current && current !== id) {
    pageHistory.push(current);
    if (pageHistory.length > 30) pageHistory.shift();
  }
  document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
  $("#" + id)?.classList.remove("hidden");
  closeMenu();
  if (id === "profilePage") loadProfile();
  if (id === "adminPage" && currentUser?.role === "admin") loadUsers();
  if (id === "staffPage" && ["admin", "club_staff"].includes(currentUser?.role))
    loadStaffPage();
  $("#backButton").disabled = pageHistory.length === 0 && id === "home";
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function goBack() {
  if (pageHistory.length) {
    const previous = pageHistory.pop();
    page(previous, false);
  } else if (!$("#home").classList.contains("hidden")) {
    return;
  } else {
    page("home", false);
  }
}
function closeMenu() {
  $("#sideMenu").classList.remove("open");
  $("#menuShade").classList.add("hidden");
}
function openAuth(mode) {
  authMode = mode;
  const reg = mode === "register";
  $("#modalTitle").textContent = reg ? "สมัครสมาชิก" : "เข้าสู่ระบบ";
  $("#authSubmit").textContent = reg ? "สมัครสมาชิก" : "เข้าสู่ระบบ";
  $("#nameField").classList.toggle("hidden", !reg);
  $("#emailField").classList.toggle("hidden", !reg);
  $("#authForm").elements.name.required = reg;
  $("#authForm").elements.password.autocomplete = reg
    ? "new-password"
    : "current-password";
  $("#authSwitch").innerHTML = reg
    ? 'มีบัญชีอยู่แล้ว? <button class="link-btn" type="button" id="switchAuth">เข้าสู่ระบบ</button>'
    : 'ยังไม่มีบัญชี? <button class="link-btn" type="button" id="switchAuth">สมัครสมาชิก</button>';
  $("#authModal").classList.remove("hidden");
  $("#authForm").reset();
}
function closeAuth() {
  $("#authModal").classList.add("hidden");
}
function renderAccount() {
  const a = $("#accountArea");
  $("#adminMenuItem").classList.toggle("hidden", currentUser?.role !== "admin");
  $("#staffMenuItem").classList.toggle(
    "hidden",
    !["admin", "club_staff"].includes(currentUser?.role),
  );
  if (!currentUser) {
    a.innerHTML =
      '<button class="btn btn-outline" id="loginOpen">เข้าสู่ระบบ</button> <button class="btn" id="registerOpen">สมัครสมาชิก</button>';
    return;
  }
  const role =
    { admin: "ผู้ดูแลระบบ", club_staff: "ผู้ดูแลชมรม", student: "นักศึกษา" }[
      currentUser.role
    ] || currentUser.role;
  const clubs = myMemberships.map((m) => m.club_id?.name).filter(Boolean);
  a.innerHTML = `<button class="account-pill" data-page="profilePage">👤 ${esc(currentUser.name)} <small>${esc(role)}${clubs.length ? " · " + esc(clubs.join(", ")) : ""}</small></button><button class="btn btn-outline" id="logoutBtn">ออกจากระบบ</button>`;
}
function isMember(id) {
  return myMemberships.some(
    (m) =>
      m.club_id?._id === id ||
      m.club_id?.id === id ||
      String(m.club_id?._id) === String(id),
  );
}
function isRegistered(id) {
  return myRegistrations.some(
    (r) => String(r.event_id?._id || r.event_id?.id) === String(id),
  );
}
function clubCard(c, i) {
  const member = isMember(c._id);
  const hasOtherClub = myMemberships.some(
    (m) => String(m.club_id?._id || m.club_id?.id) !== String(c._id),
  );
  return `<article class="club-card"><div class="club-symbol symbol-${i % 6}">${icons[i % icons.length]}</div><span class="tag">${esc(c.category || "ทั่วไป")}</span><h3>${esc(c.name)}</h3><p>${esc(c.description)}</p><div class="card-actions"><button class="btn btn-outline small-btn" data-detail-club="${c._id}">ดูรายละเอียด ↗</button>${currentUser && currentUser.role !== "admin" ? (member ? `<button class="btn btn-danger small-btn" data-leave-club="${c._id}">ออกจากชมรม</button>` : hasOtherClub ? `<button class="btn small-btn" disabled title="ออกจากชมรมปัจจุบันก่อน">มีชมรมแล้ว</button>` : `<button class="btn small-btn" data-join="${c._id}">เข้าร่วมชมรม +</button>`) : ""}${currentUser?.role === "admin" ? `<button class="btn btn-danger small-btn" data-delete-club="${c._id}">ลบ</button>` : ""}</div></article>`;
}
function renderClubs() {
  const q = ($("#clubSearch")?.value || "").trim().toLowerCase();
  const list = allClubs.filter((c) =>
    `${c.name} ${c.category} ${c.description}`.toLowerCase().includes(q),
  );
  $("#clubs").innerHTML = list.length
    ? list.map(clubCard).join("")
    : '<p class="empty">ไม่พบชมรมที่ค้นหา</p>';
  $("#homeClubs").innerHTML =
    allClubs.slice(0, 3).map(clubCard).join("") ||
    '<p class="empty">ยังไม่มีชมรม</p>';
  $("#clubCount").textContent = allClubs.length;
  $("#myClubCount").textContent = myMemberships.length;
  const sel = $("#eventClub");
  if (sel)
    sel.innerHTML = allClubs
      .map((c) => `<option value="${c._id}">${esc(c.name)}</option>`)
      .join("");
}
function eventCard(e) {
  const id = e._id;
  return `<article class="event-card"><span class="event-date">📅 ${new Date(e.event_date).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}</span><h3>${esc(e.title)}</h3><p>🏷 ชมรม: ${esc(e.club_id?.name || "ไม่ระบุ")}</p><p>📍 สถานที่: ${esc(e.location || "ไม่ระบุ")}</p><p>${esc(e.description || "กิจกรรมจากชมรม")}</p><div class="card-actions">${currentUser && currentUser.role !== "admin" ? (isRegistered(id) ? `<button class="btn btn-danger small-btn" data-cancel-event="${id}">ยกเลิกกิจกรรม</button>` : `<button class="btn btn-orange small-btn" data-register-event="${id}">ลงทะเบียน</button>`) : ""}${currentUser?.role === "admin" ? `<button class="btn btn-danger small-btn" data-delete-event="${id}">ลบกิจกรรม</button>` : ""}</div></article>`;
}
async function loadClubs() {
  try {
    allClubs = await api("/api/clubs");
    renderClubs();
  } catch (e) {
    $("#clubs").innerHTML =
      `<p class="empty">${esc(e.message)} — ตรวจสอบว่า MongoDB เปิดอยู่</p>`;
  }
}
async function loadEvents() {
  try {
    allEvents = await api("/api/events");
    $("#events").innerHTML =
      allEvents.map(eventCard).join("") ||
      '<p class="empty">ยังไม่มีกิจกรรม</p>';
    $("#homeEvents").innerHTML =
      allEvents.slice(0, 3).map(eventCard).join("") ||
      '<p class="empty">ยังไม่มีกิจกรรม</p>';
    $("#eventCount").textContent = allEvents.length;
  } catch (e) {
    $("#events").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}
async function loadProfile() {
  const box = $("#profileContent");
  if (!currentUser) {
    box.innerHTML =
      '<div class="profile-card"><h2>เข้าสู่ระบบเพื่อดูโปรไฟล์</h2><p>คุณจะดูบทบาท ชมรมที่เป็นสมาชิก และกิจกรรมที่ลงทะเบียนได้ที่นี่</p><button class="btn" id="profileLogin">เข้าสู่ระบบ</button></div>';
    return;
  }
  try {
    const [members, regs] = await Promise.all([
      api("/api/my-memberships"),
      api("/api/my-registrations"),
    ]);
    myMemberships = members;
    myRegistrations = regs;
    renderAccount();
    renderClubs();
    await loadEvents();
    const role =
      { admin: "ผู้ดูแลระบบ", club_staff: "ผู้ดูแลชมรม", student: "นักศึกษา" }[
        currentUser.role
      ] || currentUser.role;
    box.innerHTML = `<article class="profile-card profile-main"><div class="avatar">${esc((currentUser.name || "?").slice(0, 1))}</div><div><span class="tag tag-pink">${esc(role)}</span><h2>${esc(currentUser.name)}</h2><p>@${esc(currentUser.username)}</p><p>📧 ${esc(currentUser.email || "ไม่ได้ระบุอีเมล")}</p><p>🎓 บทบาทในระบบ: <b>${esc(role)}</b></p></div></article><article class="profile-card"><h2>✏️ แก้ไขโปรไฟล์</h2><form id="profileForm"><label>ชื่อที่แสดง<input name="name" required value="${esc(currentUser.name)}"></label><label>อีเมล<input name="email" type="email" value="${esc(currentUser.email || "")}"></label><label>รหัสผ่านใหม่ <small>(ไม่กรอกหากไม่ต้องการเปลี่ยน)</small><div class="password-row"><input id="profilePassword" name="password" type="password" minlength="4" autocomplete="new-password" placeholder="อย่างน้อย 4 ตัวอักษร"><button class="btn btn-outline small-btn password-toggle" type="button" data-toggle-password="profilePassword">แสดง</button></div></label><button class="btn" type="submit">บันทึกโปรไฟล์</button></form></article><article class="profile-card"><h2>🏷 ชมรมของฉัน (${myMemberships.length})</h2>${myMemberships.length ? myMemberships.map((m) => `<div class="profile-list"><div><b>${esc(m.club_id?.name || "ชมรม")}</b><p>${esc(m.club_id?.description || "")}</p></div><button class="btn btn-danger small-btn" data-leave-club="${m.club_id?._id}">ออกจากชมรม</button></div>`).join("") : "<p>ยังไม่ได้เข้าร่วมชมรม</p>"}</article><article class="profile-card"><h2>🎉 กิจกรรมที่ลงทะเบียน (${myRegistrations.length})</h2>${myRegistrations.length ? myRegistrations.map((r) => `<div class="profile-list"><div><b>${esc(r.event_id?.title || "กิจกรรม")}</b><p>${esc(r.event_id?.club_id?.name || "")} · ${r.event_id?.event_date ? new Date(r.event_id.event_date).toLocaleDateString("th-TH") : ""}</p></div><button class="btn btn-danger small-btn" data-cancel-event="${r.event_id?._id}">ยกเลิก</button></div>`).join("") : "<p>ยังไม่ได้ลงทะเบียนกิจกรรม</p>"}</article>`;
  } catch (e) {
    box.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}
async function loadUsers() {
  try {
    const [users, clubs] = await Promise.all([
      api("/api/admin/users"),
      api("/api/clubs"),
    ]);
    $("#users").innerHTML =
      `<table><thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อ</th><th>อีเมล</th><th>บทบาท / กำหนดชมรม</th></tr></thead><tbody>${users.map((u) => `<tr><td>${esc(u.username)}</td><td>${esc(u.name)}</td><td>${esc(u.email || "-")}</td><td><select data-user-role="${u.id}"><option value="student" ${u.role === "student" ? "selected" : ""}>นักศึกษา</option><option value="club_staff" ${u.role === "club_staff" ? "selected" : ""}>ผู้ดูแลชมรม</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option></select><select data-user-club="${u.id}"><option value="">เลือกชมรม (สำหรับผู้ดูแลชมรม)</option>${clubs.map((c) => `<option value="${c._id}">${esc(c.name)}</option>`).join("")}</select><button class="btn small-btn" data-save-role="${u.id}">บันทึก</button></td></tr>`).join("")}</tbody></table>`;
  } catch (e) {
    $("#users").textContent = e.message;
  }
}
async function loadStaffPage() {
  try {
    const clubs = await api("/api/staff/club");
    const sel = $("#staffClubSelect");
    sel.innerHTML = clubs
      .map((c) => `<option value="${c._id}">${esc(c.name)}</option>`)
      .join("");
    if (!clubs.length) {
      $("#staffEvents").innerHTML =
        '<p class="empty">ยังไม่มีชมรมที่กำหนดให้บัญชีนี้ กรุณาให้ Admin มอบหมายชมรมก่อน</p>';
      $("#staffMembers").innerHTML = "";
      $("#staffEventForm").classList.add("hidden");
      return;
    }
    $("#staffEventForm").classList.remove("hidden");
    await loadStaffDetails();
  } catch (e) {
    notice(e.message, true);
  }
}
async function loadStaffDetails() {
  const clubId = $("#staffClubSelect").value;
  if (!clubId) return;
  try {
    const [members, events] = await Promise.all([
      api(`/api/staff/clubs/${clubId}/members`),
      api("/api/events"),
    ]);
    const relevant = events.filter(
      (e) => String(e.club_id?._id || e.club_id) === String(clubId),
    );
    $("#staffEvents").innerHTML =
      relevant
        .map(
          (e) =>
            `<article class="event-card"><h3>${esc(e.title)}</h3><p>📅 ${e.event_date ? new Date(e.event_date).toLocaleDateString("th-TH") : ""}</p><p>📍 ${esc(e.location || "-")}</p><p>${esc(e.description || "")}</p><div class="card-actions"><button class="btn btn-outline small-btn" data-edit-staff-event="${e._id}">แก้ไข</button><button class="btn btn-danger small-btn" data-delete-staff-event="${e._id}">ลบกิจกรรม</button></div></article>`,
        )
        .join("") || '<p class="empty">ยังไม่มีกิจกรรม</p>';
    $("#staffMembers").innerHTML =
      `<table><thead><tr><th>ชื่อ</th><th>ชื่อผู้ใช้</th><th>อีเมล</th><th>จัดการ</th></tr></thead><tbody>${members.map((m) => `<tr><td>${esc(m.user.name)}</td><td>${esc(m.user.username)}</td><td>${esc(m.user.email || "-")}</td><td><button class="btn btn-danger small-btn" data-kick-member="${m.user.id}" data-club-id="${clubId}">นำออกจากชมรม</button></td></tr>`).join("")}</tbody></table>`;
  } catch (e) {
    notice(e.message, true);
  }
}

$("#staffClubSelect").addEventListener("change", loadStaffDetails);
$("#staffEventForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const club_id = $("#staffClubSelect").value;
  if (!club_id) return;
  const body = Object.fromEntries(new FormData(e.target).entries());
  body.club_id = club_id;
  try {
    const r = await api("/api/events", {
      method: "POST",
      body: JSON.stringify(body),
    });
    notice("เพิ่มกิจกรรมสำเร็จ");
    e.target.reset();
    await loadStaffDetails();
    await loadEvents();
  } catch (err) {
    notice(err.message, true);
  }
});
$("#users").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-save-role]");
  if (!b) return;
  const id = b.dataset.saveRole;
  const role = $(`[data-user-role="${id}"]`).value;
  const club_id = $(`[data-user-club="${id}"]`).value;
  try {
    const r = await api(`/api/admin/users/${id}/role`, {
      method: "PUT",
      body: JSON.stringify({ role, club_id }),
    });
    notice(r.message);
    await loadUsers();
  } catch (err) {
    notice(err.message, true);
  }
});
$("#staffMembers").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-kick-member]");
  if (!b || !confirm("ยืนยันนำสมาชิกออกจากชมรมนี้? บัญชีผู้ใช้จะไม่ถูกลบ"))
    return;
  try {
    const r = await api(
      `/api/staff/clubs/${b.dataset.clubId}/members/${b.dataset.kickMember}`,
      { method: "DELETE" },
    );
    notice(r.message);
    await loadStaffDetails();
    await refreshUser();
  } catch (err) {
    notice(err.message, true);
  }
});
$("#staffEvents").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-delete-staff-event]");
  const edit = e.target.closest("[data-edit-staff-event]");
  if (del) {
    if (!confirm("ต้องการลบกิจกรรมนี้หรือไม่?")) return;
    try {
      notice(
        (
          await api(`/api/events/${del.dataset.deleteStaffEvent}`, {
            method: "DELETE",
          })
        ).message,
      );
      await loadStaffDetails();
      await loadEvents();
    } catch (err) {
      notice(err.message, true);
    }
    return;
  }
  if (edit) {
    const ev = allEvents.find((x) => x._id === edit.dataset.editStaffEvent);
    if (!ev) return;
    const title = prompt("ชื่อกิจกรรม", ev.title);
    if (title === null) return;
    const location = prompt("สถานที่", ev.location || "");
    if (location === null) return;
    const description = prompt("รายละเอียด", ev.description || "");
    if (description === null) return;
    try {
      notice(
        (
          await api(`/api/events/${ev._id}`, {
            method: "PUT",
            body: JSON.stringify({ title, location, description }),
          })
        ).message,
      );
      await loadStaffDetails();
      await loadEvents();
    } catch (err) {
      notice(err.message, true);
    }
  }
});
async function refreshUser() {
  try {
    currentUser = (await api("/api/me")).user;
  } catch {
    currentUser = null;
  }
  if (currentUser) {
    try {
      [myMemberships, myRegistrations] = await Promise.all([
        api("/api/my-memberships"),
        api("/api/my-registrations"),
      ]);
    } catch {
      myMemberships = [];
      myRegistrations = [];
    }
  } else {
    myMemberships = [];
    myRegistrations = [];
  }
  renderAccount();
  renderClubs();
  await loadEvents();
}
async function handleClubClick(event) {
  const t = event.target.closest("button");
  if (!t) return;
  const join = t.dataset.join,
    leave = t.dataset.leaveClub,
    del = t.dataset.deleteClub,
    detail = t.dataset.detailClub;
  if (detail) {
    const c = allClubs.find((x) => x._id === detail);
    if (!c) return;
    $("#detailContent").innerHTML =
      `<div class="detail-hero"><div class="club-symbol symbol-${allClubs.indexOf(c) % 6}">${icons[allClubs.indexOf(c) % icons.length]}</div><span class="tag">${esc(c.category || "ทั่วไป")}</span><h1>${esc(c.name)}</h1><p>${esc(c.description)}</p><div class="card-actions">${currentUser && currentUser.role !== "admin" ? (isMember(c._id) ? `<button class="btn btn-danger" data-leave-club="${c._id}">ออกจากชมรม</button>` : myMemberships.length ? `<p class="notice-inline">คุณเป็นสมาชิกชมรม ${esc(myMemberships[0].club_id?.name || "แล้ว")} หากต้องการเปลี่ยนชมรม กรุณาออกจากชมรมเดิมก่อน</p>` : `<button class="btn" data-join="${c._id}">เข้าร่วมชมรม +</button>`) : ""}</div></div><h2>🎉 กิจกรรมของชมรมนี้</h2><div class="cards">${
        allEvents
          .filter((e) => String(e.club_id?._id) === String(c._id))
          .map(eventCard)
          .join("") || '<p class="empty">ชมรมนี้ยังไม่มีกิจกรรม</p>'
      }</div>`;
    page("detailPage");
    return;
  }
  if (join || leave) {
    if (!currentUser) return openAuth("login");
    try {
      const result = await api(
        `/api/clubs/${join || leave}/${join ? "join" : "leave"}`,
        { method: join ? "POST" : "DELETE" },
      );
      notice(result.message);
      await refreshUser();
      if (!$("#profilePage").classList.contains("hidden")) await loadProfile();
      if (!$("#detailPage").classList.contains("hidden")) {
        const c = allClubs.find((x) => x._id === (join || leave));
        if (c) {
          $("#detailContent").innerHTML = "";
          const fake = { target: { dataset: { detailClub: c._id } } };
          await handleClubClick(fake);
        }
      }
    } catch (e) {
      notice(e.message, true);
    }
    return;
  }
  if (del && confirm("ต้องการลบชมรมนี้และกิจกรรมที่เกี่ยวข้องหรือไม่?")) {
    try {
      notice((await api(`/api/clubs/${del}`, { method: "DELETE" })).message);
      await loadClubs();
      await loadEvents();
    } catch (e) {
      notice(e.message, true);
    }
  }
}
async function handleEventClick(event) {
  const t = event.target.closest("button");
  if (!t) return;
  const reg = t.dataset.registerEvent,
    cancel = t.dataset.cancelEvent,
    del = t.dataset.deleteEvent;
  if (reg || cancel) {
    if (!currentUser) return openAuth("login");
    try {
      notice(
        (
          await api(`/api/events/${reg || cancel}/register`, {
            method: reg ? "POST" : "DELETE",
          })
        ).message,
      );
      await refreshUser();
      if (!$("#profilePage").classList.contains("hidden")) await loadProfile();
    } catch (e) {
      notice(e.message, true);
    }
    return;
  }
  if (del && confirm("ต้องการลบกิจกรรมนี้หรือไม่?")) {
    try {
      notice((await api(`/api/events/${del}`, { method: "DELETE" })).message);
      await loadEvents();
    } catch (e) {
      notice(e.message, true);
    }
  }
}
document.addEventListener("click", (e) => {
  const p = e.target.closest("[data-page]");
  if (p) {
    const id = p.dataset.page;
    if (id === "adminPage" && currentUser?.role !== "admin") {
      notice("หน้านี้สำหรับ Admin เท่านั้น", true);
      return;
    }
    if (
      id === "staffPage" &&
      !["admin", "club_staff"].includes(currentUser?.role)
    ) {
      notice("กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแลชมรมหรือ Admin", true);
      return;
    }
    page(id);
  }
});
$("#backButton").addEventListener("click", goBack);
$("#menuToggle").addEventListener("click", () => {
  $("#sideMenu").classList.toggle("open");
  $("#menuShade").classList.toggle("hidden");
});
$("#menuClose").addEventListener("click", closeMenu);
$("#menuShade").addEventListener("click", closeMenu);
$("#accountArea").addEventListener("click", (e) => {
  if (e.target.closest("#loginOpen")) openAuth("login");
  if (e.target.closest("#registerOpen")) openAuth("register");
  if (e.target.closest("#logoutBtn"))
    api("/api/logout", { method: "POST" })
      .then(async () => {
        currentUser = null;
        myMemberships = [];
        myRegistrations = [];
        renderAccount();
        await refreshUser();
        page("home");
        notice("ออกจากระบบแล้ว");
      })
      .catch((err) => notice(err.message, true));
});
$("#modalClose").addEventListener("click", closeAuth);
$("#authModal").addEventListener("click", (e) => {
  if (e.target.id === "authModal") closeAuth();
});
$("#authSwitch").addEventListener("click", (e) => {
  if (e.target.id === "switchAuth")
    openAuth(authMode === "login" ? "register" : "login");
});
$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.currentTarget).entries());
  try {
    const result = await api(
      authMode === "login" ? "/api/login" : "/api/register",
      { method: "POST", body: JSON.stringify(body) },
    );
    currentUser = result.user;
    closeAuth();
    await refreshUser();
    notice(result.message);
  } catch (err) {
    notice(err.message, true);
  }
});
document.addEventListener("click", (e) => {
  const toggle = e.target.closest("[data-toggle-password]");
  if (toggle) {
    const input = document.getElementById(toggle.dataset.togglePassword);
    if (input) {
      input.type = input.type === "password" ? "text" : "password";
      toggle.textContent = input.type === "password" ? "แสดง" : "ซ่อน";
    }
  }
});
$("#profileContent").addEventListener("submit", async (e) => {
  if (e.target.id !== "profileForm") return;
  e.preventDefault();
  try {
    const result = await api("/api/profile", {
      method: "PUT",
      body: JSON.stringify(
        Object.fromEntries(new FormData(e.target).entries()),
      ),
    });
    currentUser = result.user;
    await refreshUser();
    await loadProfile();
    notice(result.message);
  } catch (err) {
    notice(err.message, true);
  }
});
$("#clubSearch").addEventListener("input", renderClubs);
$("#clubs").addEventListener("click", handleClubClick);
$("#homeClubs").addEventListener("click", handleClubClick);
$("#detailContent").addEventListener("click", handleClubClick);
$("#profileContent").addEventListener("click", async (e) => {
  if (e.target.closest("#profileLogin")) openAuth("login");
  await handleClubClick(e);
  await handleEventClick(e);
});
$("#events").addEventListener("click", handleEventClick);
$("#homeEvents").addEventListener("click", handleEventClick);
$("#clubForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/clubs", {
      method: "POST",
      body: JSON.stringify(
        Object.fromEntries(new FormData(e.currentTarget).entries()),
      ),
    });
    e.currentTarget.reset();
    await loadClubs();
    notice("เพิ่มชมรมสำเร็จ");
  } catch (err) {
    notice(err.message, true);
  }
});
$("#eventForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/events", {
      method: "POST",
      body: JSON.stringify(
        Object.fromEntries(new FormData(e.currentTarget).entries()),
      ),
    });
    e.currentTarget.reset();
    await loadEvents();
    notice("เพิ่มกิจกรรมสำเร็จ");
  } catch (err) {
    notice(err.message, true);
  }
});
(async () => {
  await loadClubs();
  await refreshUser();
})();
