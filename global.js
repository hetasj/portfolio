console.log("IT'S ALIVE!");

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}


let pages = [
  { url: "", title: "Home" },
  { url: "projects/", title: "Projects" },
  { url: "resume/", title: "Resume" },
  { url: "contact/", title: "Contact" },
  { url: "https://github.com/hetasj", title: "GitHub" },
];

const BASE_PATH =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "/"            // Live Server on your computer
    : "/portfolio/"; // GitHub Pages

let nav = document.createElement("nav");
document.body.prepend(nav);

for (let p of pages) {
  let url = p.url;
  let title = p.title;

  // Internal links get the base path; full https links stay as they are
  url = !url.startsWith("http") ? BASE_PATH + url : url;

  let a = document.createElement("a");
  a.href = url;
  a.textContent = title;

  // Underline the link to the page you're on
  a.classList.toggle(
    "current",
    a.host === location.host && a.pathname === location.pathname,
  );

  // Open links to other sites in a new tab
  if (a.host !== location.host) {
    a.target = "_blank";
  }

  nav.append(a);
}