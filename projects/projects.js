import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { fetchJSON, renderProjects } from "../global.js";

const projects = await fetchJSON("../lib/projects.json");
const projectsContainer = document.querySelector(".projects");
const projectsTitle = document.querySelector(".projects-title");
const searchInput = document.querySelector(".searchBar");

let query = "";
let selectedYear = null;

let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
let colors = d3.scaleOrdinal(d3.schemeTableau10);

function matchesQuery(project) {
  let values = Object.values(project).join("\n").toLowerCase();
  return values.includes(query.toLowerCase());
}

function renderPieChart(projectsGiven) {
  let rolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,
    (d) => d.year,
  );
  let data = rolledData.map(([year, count]) => {
    return { value: count, label: year };
  });

  let sliceGenerator = d3.pie().value((d) => d.value);
  let arcData = sliceGenerator(data);
  let arcs = arcData.map((d) => arcGenerator(d));

  let svg = d3.select("#projects-pie-plot");
  svg.selectAll("path").remove();
  let legend = d3.select(".legend");
  legend.selectAll("li").remove();

  arcs.forEach((arc, i) => {
    let year = data[i].label;
    svg
      .append("path")
      .attr("d", arc)
      .attr("fill", colors(year))
      .attr("class", year === selectedYear ? "selected" : "")
      .on("click", () => selectYear(year));
  });

  data.forEach((d) => {
    legend
      .append("li")
      .attr("style", `--color:${colors(d.label)}`)
      .attr("class", d.label === selectedYear ? "legend-item selected" : "legend-item")
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on("click", () => selectYear(d.label));
  });
}


function selectYear(year) {
  selectedYear = selectedYear === year ? null : year;
  update();
}

function update() {
  let searchResults = projects.filter(matchesQuery);

  if (selectedYear !== null && !searchResults.some((p) => p.year === selectedYear)) {
    selectedYear = null;
  }

  let visibleProjects =
    selectedYear === null
      ? searchResults
      : searchResults.filter((p) => p.year === selectedYear);

  renderProjects(visibleProjects, projectsContainer, "h2");
  let count = visibleProjects.length;
  projectsTitle.textContent = `${count} ${count === 1 ? "Project" : "Projects"}`;
  renderPieChart(searchResults);
}

searchInput.addEventListener("input", (event) => {
  query = event.target.value;
  update();
});

update();