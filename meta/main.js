import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import scrollama from "https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm";

let xScale;
let yScale;
let rScale;

// one color per language
let colors = d3.scaleOrdinal(d3.schemeTableau10);

// read the CSV and convert numbers and dates from strings
async function loadData() {
  const data = await d3.csv("loc.csv", (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + "T00:00" + row.timezone),
    datetime: new Date(row.datetime),
  }));

  return data;
}

// one object per commit instead of one per line
function processCommits(data) {
  const commits = d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      let first = lines[0];
      let { author, date, time, timezone, datetime } = first;

      let ret = {
        id: commit,
        url: "https://github.com/hetasj/portfolio/commit/" + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      Object.defineProperty(ret, "lines", {
        value: lines,
        enumerable: false,
        writable: false,
        configurable: false,
      });

      return ret;
    });

  // oldest first, so the story and slider run in time order
  return d3.sort(commits, (d) => d.datetime);
}

// stats for the commits shown
function renderCommitInfo(commits) {
  const data = commits.flatMap((d) => d.lines);

  // clear the old stats first so they get replaced instead of stacked
  d3.select("#stats").html("");
  const dl = d3.select("#stats").append("dl").attr("class", "stats");

  dl.append("dt").html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append("dd").text(data.length);

  dl.append("dt").text("Commits");
  dl.append("dd").text(commits.length);

  dl.append("dt").text("Files");
  dl.append("dd").text(d3.group(data, (d) => d.file).size);

  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (v) => v.line),
    (d) => d.file,
  );
  dl.append("dt").text("Avg file length");
  dl.append("dd").text(Math.round(d3.mean(fileLengths, (d) => d[1])) + " lines");

  dl.append("dt").text("Longest line");
  dl.append("dd").text(d3.max(data, (d) => d.length) + " chars");

  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => d.datetime.toLocaleString("en", { dayPeriod: "short" }),
  );
  const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0];
  dl.append("dt").text("Most active");
  dl.append("dd").text(maxPeriod.replace(/^(in the|at) /, ""));
}

// draw the chart frame once
function renderScatterPlot(commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 20 };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select("#chart")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("overflow", "visible");

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  // set once from all commits
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  const gridlines = svg
    .append("g")
    .attr("class", "gridlines")
    .attr("transform", `translate(${usableArea.left}, 0)`);

  gridlines.call(d3.axisLeft(yScale).tickFormat("").tickSize(-usableArea.width));

  // classes so updateScatterPlot can find the axes later
  svg
    .append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0, ${usableArea.bottom})`);

  svg
    .append("g")
    .attr("class", "y-axis")
    .attr("transform", `translate(${usableArea.left}, 0)`)
    .call(
      d3.axisLeft(yScale).tickFormat((d) => String(d % 24).padStart(2, "0") + ":00"),
    );

  svg.append("g").attr("class", "dots");

  // brush then keep the dots above the brush overlay
  svg.call(d3.brush().on("start brush end", brushed));
  svg.selectAll(".dots, .overlay ~ *").raise();

  updateScatterPlot(commits);
}

// redraw only what changes
function updateScatterPlot(commits) {
  const svg = d3.select("#chart").select("svg");

  xScale.domain(d3.extent(commits, (d) => d.datetime)).nice();

  const xAxisGroup = svg.select("g.x-axis");
  xAxisGroup.selectAll("*").remove();
  xAxisGroup.call(d3.axisBottom(xScale));

  svg
    .select("g.dots")
    .selectAll("circle")
    .data(commits, (d) => d.id) // match circles by commit ID
    .join("circle")
    .attr("cx", (d) => xScale(d.datetime))
    .attr("cy", (d) => yScale(d.hourFrac))
    .attr("r", (d) => rScale(d.totalLines))
    .attr("fill", "steelblue")
    .style("fill-opacity", 0.7)
    .on("mouseenter", (event, commit) => {
      d3.select(event.currentTarget).style("fill-opacity", 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on("mouseleave", (event) => {
      d3.select(event.currentTarget).style("fill-opacity", 0.7);
      updateTooltipVisibility(false);
    })
    // big dots first in the page
    .sort((a, b) => b.totalLines - a.totalLines);
}

// one dot per line of code, grouped by file
function updateFileDisplay(commits) {
  let lines = commits.flatMap((d) => d.lines);

  let files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => {
      return { name, lines };
    })
    .sort((a, b) => b.lines.length - a.lines.length); // Step 2.3: biggest first

  let filesContainer = d3
    .select("#files")
    .selectAll("div")
    .data(files, (d) => d.name)
    .join(
      // runs only when a file first appears
      (enter) =>
        enter.append("div").call((div) => {
          div.append("dt");
          div.append("dd");
        }),
    )
    .order(); // keep the page order matching the sorted list

  // runs every time: file name with its line count underneath
  filesContainer
    .select("dt")
    .html((d) => `<code>${d.name}</code><small>${d.lines.length} lines</small>`);

  // one small dot per line colored by language
  filesContainer
    .select("dd")
    .selectAll("div")
    .data((d) => d.lines)
    .join("div")
    .attr("class", "loc")
    .attr("style", (d) => `--color: ${colors(d.type)}`);
}

// fill in the tooltip for one commit
function renderTooltipContent(commit) {
  const link = document.getElementById("commit-link");
  const date = document.getElementById("commit-date");
  const time = document.getElementById("commit-time-tooltip");
  const author = document.getElementById("commit-author");
  const lines = document.getElementById("commit-lines");

  if (Object.keys(commit).length === 0) return;

  link.href = commit.url;
  link.textContent = commit.id;
  date.textContent = commit.datetime?.toLocaleString("en", { dateStyle: "full" });
  time.textContent = commit.datetime?.toLocaleString("en", { timeStyle: "short" });
  author.textContent = commit.author;
  lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById("commit-tooltip");
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById("commit-tooltip");
  tooltip.style.left = `${event.clientX + 12}px`;
  tooltip.style.top = `${event.clientY + 12}px`;
}

// is this commit's dot inside the brushed rectangle
function isCommitSelected(selection, commit) {
  if (!selection) {
    return false;
  }

  const [x0, x1] = selection.map((d) => d[0]);
  const [y0, y1] = selection.map((d) => d[1]);
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);

  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function brushed(event) {
  const selection = event.selection;

  d3.selectAll("#chart circle").classed("selected", (d) =>
    isCommitSelected(selection, d),
  );

  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

// only counts commits currently shown (filteredCommits), not hidden ones
function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];

  const countElement = document.querySelector("#selection-count");
  countElement.textContent = `${selectedCommits.length || "No"} commits selected`;

  return selectedCommits;
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById("language-breakdown");

  if (selectedCommits.length === 0) {
    container.innerHTML = "";
    return;
  }

  const lines = selectedCommits.flatMap((d) => d.lines);
  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  container.innerHTML = "";

  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format(".1~%")(proportion);

    container.innerHTML += `
      <dt>${language}</dt>
      <dd>${count} lines (${formatted})</dd>
    `;
  }
}

// load data and draw everything

let data = await loadData();
let commits = processCommits(data);

// slider position (0 to 100) to a date and back
let commitProgress = 100;
let timeScale = d3
  .scaleTime()
  .domain([d3.min(commits, (d) => d.datetime), d3.max(commits, (d) => d.datetime)])
  .range([0, 100]);
let commitMaxTime = timeScale.invert(commitProgress);

// the commits up to commitMaxTime
let filteredCommits = commits;

const slider = document.getElementById("commit-progress");
const timeDisplay = document.getElementById("commit-time");

// everything that should change when the time changes
function updateEverything() {
  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);

  timeDisplay.textContent = commitMaxTime.toLocaleString("en", {
    dateStyle: "long",
    timeStyle: "short",
  });

  updateScatterPlot(filteredCommits);
  updateFileDisplay(filteredCommits);
  renderCommitInfo(filteredCommits);
}

// the slider sets the time
function onTimeSliderChange() {
  commitProgress = Number(slider.value);
  commitMaxTime = timeScale.invert(commitProgress);
  updateEverything();
}

slider.addEventListener("input", onTimeSliderChange);

renderScatterPlot(commits);
onTimeSliderChange();

// one story paragraph per commit
d3.select("#scatter-story")
  .selectAll(".step")
  .data(commits)
  .join("div")
  .attr("class", "step")
  .html((d, i) => {
    const date = d.datetime.toLocaleString("en", {
      dateStyle: "full",
      timeStyle: "short",
    });
    const fileCount = d3.group(d.lines, (line) => line.file).size;
    const label = i === 0 ? "my first commit" : `commit ${i + 1}`;

    return `
      On ${date}, I made <a href="${d.url}" target="_blank">${label}</a>.
      It edited ${d.totalLines} lines across ${fileCount} ${fileCount === 1 ? "file" : "files"}.
    `;
  });

//scrolling to a commit's paragraph sets the time
function onStepEnter(response) {
  commitMaxTime = response.element.__data__.datetime;

  // move the slider too so both controls agree
  commitProgress = timeScale(commitMaxTime);
  slider.value = commitProgress;

  updateEverything();
}

const scroller = scrollama();
scroller
  .setup({
    container: "#scrolly-1",
    step: "#scrolly-1 .step",
  })
  .onStepEnter(onStepEnter);