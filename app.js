const navItems = document.querySelectorAll("[data-page]");
const pages = document.querySelectorAll("[data-view]");
const pageLabel = document.getElementById("pageLabel");
const sidebar = document.getElementById("sidebar");
const appShell = document.querySelector(".app-shell");
const sidebarToggle = document.getElementById("sidebarToggle");
const themeButton = document.getElementById("themeButton");
const themeMenu = document.getElementById("themeMenu");

function showPage(pageName) {
  pages.forEach((page) => page.classList.toggle("active-page", page.dataset.view === pageName));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === pageName));
  const active = document.querySelector(`[data-view="${pageName}"]`);
  pageLabel.textContent = pageName === "overview" ? "Portfolio" : active?.querySelector("h1")?.textContent || "Home";
  sidebar.classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

navItems.forEach((item) => item.addEventListener("click", () => showPage(item.dataset.page)));
document.getElementById("mobileMenu").addEventListener("click", () => sidebar.classList.toggle("open"));
function setSidebarCollapsed(collapsed) {
  appShell.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggle.setAttribute("aria-label", collapsed ? "Expand navigation" : "Collapse navigation");
  sidebarToggle.title = collapsed ? "Expand navigation" : "Collapse navigation";
  sidebarToggle.textContent = collapsed ? "›" : "‹";
}
sidebarToggle.addEventListener("click", () => setSidebarCollapsed(!appShell.classList.contains("sidebar-collapsed")));

async function saveSettings() {
  const status = document.getElementById("settingsStatus");
  const body = {
    displayName: document.getElementById("settingsDisplayName")?.value.trim(),
    username: document.getElementById("settingsUsername")?.value.trim(),
    timezone: document.getElementById("settingsTimezone")?.value.trim(),
  };
  try {
    const response = await fetch("/api/v1/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("Unable to save settings");
    status.textContent = "Settings saved.";
  } catch {
    status.textContent = "Connect the API to save settings.";
  }
}

document.getElementById("saveSettings")?.addEventListener("click", saveSettings);
document.getElementById("deleteAccount")?.addEventListener("click", async () => {
  if (!window.confirm("Delete your CodeOrbit account permanently?")) return;
  const status = document.getElementById("settingsStatus");
  try {
    const response = await fetch("/api/v1/me", { method: "DELETE" });
    if (!response.ok) throw new Error("Unable to delete account");
    status.textContent = "Account deleted. You can close this page.";
  } catch {
    status.textContent = "Connect the API to delete your account.";
  }
});

function applyTheme(theme) {
  const resolvedTheme = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
  document.documentElement.dataset.theme = resolvedTheme;
  localStorage.setItem("codeorbit-theme", theme);
  themeButton.setAttribute("data-current-theme", theme);
  themeMenu.querySelectorAll("[data-theme]").forEach((item) => item.classList.toggle("selected", item.dataset.theme === theme));
}

const savedTheme = localStorage.getItem("codeorbit-theme") || "light";
applyTheme(savedTheme);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (localStorage.getItem("codeorbit-theme") === "system") applyTheme("system");
});
themeButton.addEventListener("click", (event) => {
  event.stopPropagation();
  const open = themeMenu.classList.toggle("open");
  themeButton.setAttribute("aria-expanded", String(open));
});
themeMenu.querySelectorAll("[data-theme]").forEach((item) => {
  item.addEventListener("click", () => {
    applyTheme(item.dataset.theme);
    themeMenu.classList.remove("open");
    themeButton.setAttribute("aria-expanded", "false");
  });
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".theme-control")) {
    themeMenu.classList.remove("open");
    themeButton.setAttribute("aria-expanded", "false");
  }
});

const heatmap = document.getElementById("heatmapGrid");
const heatmapMonths = document.getElementById("heatmapMonths");
const activityTotal = document.getElementById("activityTotal");
const activityStatus = document.getElementById("activityStatus");
const activityPlatform = document.getElementById("activityPlatform");

function utcDay(date) {
  return date.toISOString().slice(0, 10);
}

function sampleActivity() {
  const activity = [];
  const today = new Date();
  for (let offset = 364; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - offset);
    const submissions = (offset * 17) % 23 < 5 ? (offset % 4) + 1 : 0;
    activity.push({ day: utcDay(date), submissions, accepted: submissions ? Math.ceil(submissions / 2) : 0 });
  }
  return activity;
}

function activityLevel(submissions, maximum) {
  if (!submissions) return 0;
  if (submissions >= maximum * 0.75) return 4;
  if (submissions >= maximum * 0.5) return 3;
  if (submissions >= maximum * 0.25) return 2;
  return 1;
}

function renderHeatmap(activity) {
  if (!heatmap) return;
  const byDay = new Map(activity.map((entry) => [entry.day, entry]));
  const values = activity.map((entry) => entry.submissions);
  const maximum = Math.max(...values, 1);
  heatmap.replaceChildren();
  if (heatmapMonths) heatmapMonths.replaceChildren();
  let previousMonth = "";
  const today = new Date();
  for (let offset = 364; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - offset);
    const day = utcDay(date);
    const entry = byDay.get(day) || { day, submissions: 0, accepted: 0 };
    const cell = document.createElement("i");
    cell.className = `level-${activityLevel(entry.submissions, maximum)}`;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `${day}: ${entry.submissions} submissions, ${entry.accepted} accepted`);
    cell.title = `${day}: ${entry.submissions} submissions`;
    heatmap.appendChild(cell);
    const month = date.toLocaleString("en", { month: "short", timeZone: "UTC" });
    if (month !== previousMonth && heatmapMonths) {
      const label = document.createElement("span");
      label.textContent = month;
      heatmapMonths.appendChild(label);
      previousMonth = month;
    }
  }
  const total = activity.reduce((sum, entry) => sum + entry.submissions, 0);
  if (activityTotal) activityTotal.textContent = total.toLocaleString();
  if (activityStatus) activityStatus.textContent = `${activity.filter((entry) => entry.submissions > 0).length} active days`;
}

async function loadHeatmap(platform = "") {
  const query = platform ? `?platform=${encodeURIComponent(platform)}` : "";
  try {
    const response = await fetch(`/api/v1/dashboard/heatmap${query}`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Heatmap request failed: ${response.status}`);
    const data = await response.json();
    renderHeatmap(data.activity);
  } catch {
    renderHeatmap(sampleActivity());
    if (activityStatus) activityStatus.textContent = "Preview data";
  }
}

activityPlatform?.addEventListener("change", () => loadHeatmap(activityPlatform.value));
loadHeatmap();

const difficultyChart = document.getElementById("difficultyChart");
const monthlyChart = document.getElementById("monthlyChart");

function renderCharts(charts) {
  if (difficultyChart) {
    difficultyChart.replaceChildren();
    const maximum = Math.max(...charts.difficulty.map((point) => point.solved), 1);
    charts.difficulty.forEach((point) => {
      const item = document.createElement("div");
      item.className = "bar-item";
      const bar = document.createElement("i");
      bar.style.height = `${Math.max(3, (point.solved / maximum) * 100)}%`;
      bar.setAttribute("aria-label", `${point.difficulty}: ${point.solved} solved`);
      const label = document.createElement("span");
      label.textContent = point.difficulty;
      item.append(bar, label);
      difficultyChart.appendChild(item);
    });
  }
  if (monthlyChart) {
    monthlyChart.replaceChildren();
    const maximum = Math.max(...charts.monthly.map((point) => point.submissions), 1);
    charts.monthly.forEach((point) => {
      const item = document.createElement("div");
      item.className = "line-item";
      const bar = document.createElement("b");
      bar.style.height = `${Math.max(3, (point.submissions / maximum) * 82)}%`;
      bar.title = `${point.month}: ${point.submissions} submissions, ${point.accepted} accepted`;
      const dot = document.createElement("i");
      const label = document.createElement("span");
      label.textContent = point.month.slice(5);
      item.append(dot, bar, label);
      monthlyChart.appendChild(item);
    });
  }
}

function sampleCharts() {
  return {
    difficulty: [
      { difficulty: "easy", solved: 132 },
      { difficulty: "medium", solved: 161 },
      { difficulty: "hard", solved: 54 },
      { difficulty: "unrated", solved: 0 },
    ],
    monthly: Array.from({ length: 12 }, (_, index) => ({
      month: `${new Date().getUTCFullYear()}-${String(index + 1).padStart(2, "0")}`,
      submissions: (index * 13) % 42,
      accepted: (index * 7) % 22,
    })),
  };
}

async function loadCharts() {
  try {
    const response = await fetch("/api/v1/dashboard/charts?months=12", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Charts request failed: ${response.status}`);
    renderCharts((await response.json()).charts);
  } catch {
    renderCharts(sampleCharts());
  }
}

loadCharts();

const calendar = document.getElementById("calendarDays");
const calendarTitle = document.getElementById("calendarTitle");
const contestPlatform = document.getElementById("contestPlatform");
const exportContests = document.getElementById("exportContests");
let contestMonth = new Date();

function sampleContests() {
  const year = contestMonth.getUTCFullYear();
  const month = contestMonth.getUTCMonth();
  return [3, 12, 19].map((day, index) => ({
    name: ["Weekly Contest 421", "Codeforces Round 978", "Starters 158"][index],
    platform: ["leetcode", "codeforces", "codechef"][index],
    startsAt: new Date(Date.UTC(year, month, day, 18, 0)).toISOString(),
    endsAt: new Date(Date.UTC(year, month, day, 20, 0)).toISOString(),
    url: "#",
  }));
}

function renderCalendar(contests) {
  if (!calendar) return;
  const year = contestMonth.getUTCFullYear();
  const month = contestMonth.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  calendar.replaceChildren();
  if (calendarTitle) calendarTitle.textContent = contestMonth.toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });
  const byDay = new Map(contests.map((contest) => [new Date(contest.startsAt).getUTCDate(), contest]));
  for (let index = 0; index < firstDay; index += 1) calendar.appendChild(document.createElement("div"));
  for (let day = 1; day <= daysInMonth; day += 1) {
    const cell = document.createElement("div");
    cell.textContent = day;
    if (day === new Date().getUTCDate() && month === new Date().getUTCMonth() && year === new Date().getUTCFullYear()) cell.classList.add("today");
    const contest = byDay.get(day);
    if (contest) {
      const event = document.createElement("a");
      event.className = "calendar-event";
      event.href = contest.url;
      event.textContent = contest.name;
      event.target = "_blank";
      event.rel = "noreferrer";
      cell.appendChild(event);
    }
    calendar.appendChild(cell);
  }
}

async function loadContests() {
  const year = contestMonth.getUTCFullYear();
  const month = contestMonth.getUTCMonth();
  const from = new Date(Date.UTC(year, month, 1)).toISOString();
  const to = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59)).toISOString();
  const platform = contestPlatform?.value || "";
  const query = new URLSearchParams({ from, to });
  if (platform) query.set("platform", platform);
  if (exportContests) exportContests.href = `/api/v1/contests.ics?${query.toString()}`;
  try {
    const response = await fetch(`/api/v1/contests?${query.toString()}`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Contest request failed: ${response.status}`);
    renderCalendar((await response.json()).contests);
  } catch {
    renderCalendar(sampleContests());
  }
}

contestPlatform?.addEventListener("change", loadContests);
document.getElementById("previousMonth")?.addEventListener("click", () => { contestMonth.setUTCMonth(contestMonth.getUTCMonth() - 1); loadContests(); });
document.getElementById("nextMonth")?.addEventListener("click", () => { contestMonth.setUTCMonth(contestMonth.getUTCMonth() + 1); loadContests(); });
loadContests();

document.querySelectorAll(".suggestions button").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.querySelector(".chat-input input");
    input.value = button.textContent;
    input.focus();
  });
});
