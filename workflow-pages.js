(function () {
  "use strict";

  const PROCESS_KEY = "teamDashboardBgfWorkflowV1";
  const VACATION_KEY = "teamDashboardVacationStatusV1";
  const CONTENT_REFERENCE_KEY = "teamDashboardContentReferencesV1";
  const MANUAL_EVENTS_KEY = "teamDashboardManualEventsV1";
  const VACATION_EVENT_PREFIX = "vacation-table-";
  const PAGE_CLASS = "addon-page-active";
  const PROCESS_GROUPS = ["기획 프로세스", "촬영 취재 유의사항", "이벤트", "광고", "비용처리", "월간 보고", "기타"];
  const VACATION_DATE_SLOTS = 20;
  let activePage = "";
  const saveTimers = new Map();
  let observerBusy = false;
  let calendarSyncedOnce = false;

  const DEFAULT_PROCESS_ROWS = [
    { group: "기획 프로세스", phase: "1. 스케줄링", task: "월간 스케줄링", timing: "전월 24~26일", detail: "기획 회의 전달 및 BGF 자료 수령\n4글자 내외의 짧은 컨셉 문구 작성\n촬영·디자인 요청과 원고 작성 일정을 고려하여 스케줄링" },
    { group: "기획 프로세스", phase: "1. 스케줄링", task: "촬영 스케줄 조율", timing: "전월 5째주", detail: "인터뷰이에게 연락하여 촬영 시간대 협의\n확정 시 촬영팀에 스케줄 공유" },
    { group: "기획 프로세스", phase: "2. 취재 준비", task: "서면질의서 전달", timing: "촬영 1주일 전", detail: "미리링·이중희 책임님 참조 필수\n최대한 주제·키워드에 맞게 흐름이 이어지도록 질의 구성\n콘텐츠 주제에 맞는 수급 사진 준비" },
    { group: "기획 프로세스", phase: "2. 취재 준비", task: "취재/촬영 준비", timing: "촬영 2일 전", detail: "촬영팀에 촬영 레퍼런스와 장소 공유\n정장인지 통청바지인지 체크하고 콘텐츠 컨셉에 따라 꼭 필요한 촬영샷 확인" },
    { group: "기획 프로세스", phase: "2. 취재 준비", task: "인터뷰 일정 재확인", timing: "촬영 전날", detail: "인터뷰이에게 연락하여 다음 날 촬영 일정 재안내" },
    { group: "기획 프로세스", phase: "2. 취재 준비", task: "취재/촬영", timing: "촬영 당일", detail: "편의점 촬영 시 편의점 전경과 점포 이름을 클로즈업하여 촬영" },
    { group: "기획 프로세스", phase: "3. 콘텐츠 제작", task: "디자인 요청", timing: "촬영 다음날", detail: "썸네일 스케줄 헤드 카피 반영\n인물이 눈 감은 사진은 제외하고 사진 크롭에 유의\n기간 2~3일을 고려해 디자인 요청" },
    { group: "기획 프로세스", phase: "3. 콘텐츠 제작", task: "원고 초안 마무리", timing: "발행일 2일 전", detail: "카테고리별 기존 콘텐츠 톤앤매너를 참고하여 작성\n해시태그 추가 및 원고 제목 작성\nQ&A 형식은 주제와 답변 내용이 벗어나지 않도록 작성" },
    { group: "기획 프로세스", phase: "3. 콘텐츠 제작", task: "원고 수정 및 컨펌 요청", timing: "발행일 1~2일 전", detail: "내부 컨펌 후 원고와 제작 이미지를 전달" },
    { group: "기획 프로세스", phase: "4. 업로드", task: "콘텐츠 발행", timing: "발행일", detail: "관리자 IP로 등록된 환경에서 진행\n줄간격, 사진·글 사이 여백, 오탈자와 링크를 확인한 뒤 발행" },
    { group: "기획 프로세스", phase: "4. 업로드", task: "BGF 관리자 사이트", timing: "필요 시", detail: "관리자 URL과 계정 정보는 보안을 위해 내부 문서에서 확인" },
    { group: "촬영 취재 유의사항", phase: "촬영본", task: "인터뷰", timing: "촬영 전", detail: "촬영 전 인터뷰할 내용을 간략하게 준비" },
    { group: "촬영 취재 유의사항", phase: "촬영본", task: "보정본 셀렉", timing: "촬영일 익일", detail: "한 동작별 1~2컷만 셀렉하고 전체 20장 내외로 선정" },
    { group: "촬영 취재 유의사항", phase: "촬영본", task: "광고주 전달", timing: "-", detail: "A컷 보정본만 이중희 책임님께 압축파일로 전달" },
    { group: "이벤트", phase: "이벤트", task: "이벤트 기획", timing: "콘텐츠 기획 시", detail: "이벤트 전용 게시물 업로드를 지양하고 매거진 콘텐츠 조회 이달을 높이기 위한 이벤트 운영\n수량 1건 취급, 썸네일의 이벤트 진행 중 문구 확인" },
    { group: "이벤트", phase: "이벤트", task: "핸들링", timing: "마감 후 1~2일", detail: "당첨자 리스트를 광고주에 전달\n이벤트 이미지와 타이틀은 광고주 확인 후 삭제" },
    { group: "이벤트", phase: "이벤트", task: "경품 전달 및 실비 처리", timing: "당첨자 발표일", detail: "경품 개별 증정 후 월말 실비 지급 처리" },
    { group: "광고", phase: "광고", task: "광고 운영", timing: "캠페인별", detail: "광고 운영 일정과 결과를 기재" },
    { group: "비용처리", phase: "비용처리", task: "견적서/전월 증빙서류 전달", timing: "매월 첫째주", detail: "BGF와 BGF리테일 비용을 각각 구분하여 처리" },
    { group: "비용처리", phase: "비용처리", task: "당월 세금계산서 발행", timing: "매월 25일", detail: "발행 후 담당자에게 공유" },
    { id: "workflow-monthly-report", group: "월간 보고", phase: "월간 보고", task: "월간 보고", timing: "매월", detail: "" },
    { group: "기타", phase: "링크트리", task: "링크 및 계정 관리", timing: "필요 시", detail: "공개 가능한 링크만 기재하고 비밀번호는 내부 문서에서 관리" }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function parseStored(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return Array.isArray(parsed) ? parsed : clone(fallback);
    } catch {
      return clone(fallback);
    }
  }

  function canonicalProcessGroup(value) {
    const compact = String(value || "").replace(/\s+/g, "").replaceAll("/", "");
    if (compact === "촬영취재유의사항") return "촬영 취재 유의사항";
    if (compact === "비용처리") return "비용처리";
    if (compact === "링크트리" || compact === "기타") return "기타";
    if (compact === "월간보고") return "월간 보고";
    return PROCESS_GROUPS.includes(value) ? value : "기획 프로세스";
  }

  function normalizeProcessRow(row) {
    return {
    id: row.id || crypto.randomUUID(),
    group: canonicalProcessGroup(row.group),
    phase: row.phase || "",
    task: row.task || "",
    timing: row.timing || "",
    detail: row.detail || ""
    };
  }

  function normalizeProcessRows(rows) {
    const normalized = rows.map(normalizeProcessRow);
    if (!normalized.some((row) => row.group === "월간 보고")) {
      const monthlyRow = normalizeProcessRow({
        id: "workflow-monthly-report",
        group: "월간 보고",
        phase: "월간 보고",
        task: "월간 보고",
        timing: "매월",
        detail: ""
      });
      const miscIndex = normalized.findIndex((row) => row.group === "기타");
      normalized.splice(miscIndex < 0 ? normalized.length : miscIndex, 0, monthlyRow);
    }
    return normalized;
  }

  let processRows = normalizeProcessRows(parseStored(PROCESS_KEY, DEFAULT_PROCESS_ROWS));
  let vacationRows = parseStored(VACATION_KEY, [{
    id: crypto.randomUUID(), name: "", total: "", annualDates: [""], halfDates: [""]
  }]).map(normalizeVacationRow);
  let contentReferenceRows = parseStored(CONTENT_REFERENCE_KEY, [{
    id: crypto.randomUUID(), subject: "", url: "", idea: "", used: false
  }]).map(normalizeContentReferenceRow);

  function normalizeContentReferenceRow(row) {
    return {
      id: row.id || crypto.randomUUID(),
      subject: String(row.subject || ""),
      url: String(row.url || ""),
      idea: String(row.idea || ""),
      used: Boolean(row.used)
    };
  }

  function contentReferenceUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(candidate);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
    } catch {
      return "";
    }
  }

  function normalizeVacationRow(row) {
    const normalizeSlots = (dates) => Array.from({ length: VACATION_DATE_SLOTS }, (_, index) => shortDate(Array.isArray(dates) ? dates[index] : ""));
    return {
      id: row.id || crypto.randomUUID(),
      name: row.name || "",
      total: row.total === 0 ? "0" : String(row.total || ""),
      annualDates: normalizeSlots(row.annualDates),
      halfDates: normalizeSlots(row.halfDates)
    };
  }

  function shortDate(value) {
    const text = String(value || "").trim();
    const iso = text.match(/^\d{4}-(\d{1,2})-(\d{1,2})$/);
    const short = text.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})$/);
    const match = iso || short;
    if (!match) return text.slice(0, 5);
    return `${Number(match[1])}/${Number(match[2])}`;
  }

  function persist(key, value) {
    window.clearTimeout(saveTimers.get(key));
    saveTimers.set(key, window.setTimeout(() => {
      localStorage.setItem(key, JSON.stringify(value));
      saveTimers.delete(key);
    }, 180));
  }

  function vacationCalendarDate(value) {
    const text = String(value || "").trim();
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const short = text.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})$/);
    const year = iso ? Number(iso[1]) : new Date().getFullYear();
    const month = Number(iso ? iso[2] : short?.[1]);
    const day = Number(iso ? iso[3] : short?.[2]);
    if (!year || !month || !day) return "";
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function syncVacationCalendar() {
    const raw = localStorage.getItem(MANUAL_EVENTS_KEY);
    if (raw === null) return;
    let existing;
    try {
      existing = JSON.parse(raw);
    } catch {
      existing = [];
    }
    if (!Array.isArray(existing)) existing = [];
    const manualEvents = existing.filter((event) => !String(event?.id || "").startsWith(VACATION_EVENT_PREFIX));
    const generated = [];
    const seen = new Set();
    vacationRows.forEach((row) => {
      [
        { key: "annualDates", token: "annual", label: "연차" },
        { key: "halfDates", token: "half", label: "반차" }
      ].forEach(({ key, token, label }) => {
        row[key].forEach((value) => {
          const date = vacationCalendarDate(value);
          const unique = `${row.id}-${token}-${date}`;
          if (!date || seen.has(unique)) return;
          seen.add(unique);
          generated.push({
            id: `${VACATION_EVENT_PREFIX}${unique}`,
            date,
            type: "휴가",
            title: `${String(row.name || "성명 미입력").trim() || "성명 미입력"} ${label}`,
            source: "vacation-status"
          });
        });
      });
    });
    generated.sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title, "ko"));
    const serialized = JSON.stringify([...manualEvents, ...generated]);
    if (serialized === raw) return;
    localStorage.setItem(MANUAL_EVENTS_KEY, serialized);
    window.dispatchEvent(new CustomEvent("dashboard-shared-state", {
      detail: { key: MANUAL_EVENTS_KEY, value: serialized }
    }));
  }

  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function field(tag, value, ariaLabel, onInput) {
    const node = document.createElement(tag);
    node.value = value || "";
    node.setAttribute("aria-label", ariaLabel);
    if (tag === "textarea") node.rows = 3;
    node.addEventListener("input", () => onInput(node.value));
    return node;
  }

  function makeTab(label, page, icon) {
    const button = create("button", "addon-tab");
    button.type = "button";
    button.dataset.addonPage = page;
    button.setAttribute("aria-label", label);
    button.append(create("span", "addon-tab-icon", icon), document.createTextNode(label));
    button.addEventListener("click", () => showPage(page));
    return button;
  }

  function ensureTabs() {
    if (observerBusy) return;
    const nav = document.querySelector(".page-tabs");
    const main = document.querySelector(".dashboard-main");
    if (!nav || !main) return;
    observerBusy = true;
    try {
      if (!nav.querySelector('[data-addon-page="content-reference"]')) {
        const baseTabs = Array.from(nav.querySelectorAll("button:not(.addon-tab)"));
        const contentTab = makeTab("콘텐츠 레퍼런스", "content-reference", "▤");
        nav.insertBefore(contentTab, baseTabs[1] || null);
      }
      if (!nav.querySelector('[data-addon-page="process"]')) {
        nav.append(makeTab("업무 프로세스", "process", "▦"));
      }
      if (!nav.querySelector('[data-addon-page="vacation"]')) {
        nav.append(makeTab("휴가 사용 현황", "vacation", "☀"));
      }
      Array.from(nav.querySelectorAll("button:not(.addon-tab)")).forEach((button) => {
        if (button.dataset.addonCloseBound) return;
        button.dataset.addonCloseBound = "true";
        button.addEventListener("click", hideAddonPage);
      });
      if (!calendarSyncedOnce) {
        calendarSyncedOnce = true;
        window.setTimeout(() => {
          vacationRows = parseStored(VACATION_KEY, [{
            id: crypto.randomUUID(), name: "", total: "", annualDates: [""], halfDates: [""]
          }]).map(normalizeVacationRow);
          syncVacationCalendar();
        }, 120);
      }
      if (activePage) {
        document.body.classList.add(PAGE_CLASS);
        nav.querySelectorAll("button").forEach((button) => {
          button.classList.toggle("active", button.dataset.addonPage === activePage);
        });
        let page = main.querySelector(".addon-page");
        if (!page) {
          page = create("section", "addon-page");
          main.append(page);
          renderActivePage(page);
        }
      }
    } finally {
      observerBusy = false;
    }
  }

  function showPage(page) {
    processRows = normalizeProcessRows(parseStored(PROCESS_KEY, DEFAULT_PROCESS_ROWS));
    vacationRows = parseStored(VACATION_KEY, [{
      id: crypto.randomUUID(), name: "", total: "", annualDates: [""], halfDates: [""]
    }]).map(normalizeVacationRow);
    contentReferenceRows = parseStored(CONTENT_REFERENCE_KEY, [{
      id: crypto.randomUUID(), subject: "", url: "", idea: "", used: false
    }]).map(normalizeContentReferenceRow);
    syncVacationCalendar();
    activePage = page;
    const existing = document.querySelector(".addon-page");
    if (existing) existing.remove();
    ensureTabs();
  }

  function hideAddonPage() {
    activePage = "";
    document.body.classList.remove(PAGE_CLASS);
    document.querySelector(".addon-page")?.remove();
    document.querySelectorAll(".addon-tab").forEach((button) => button.classList.remove("active"));
  }

  function renderActivePage(container) {
    container.replaceChildren();
    if (activePage === "content-reference") renderContentReferencePage(container);
    if (activePage === "process") renderProcessPage(container);
    if (activePage === "vacation") renderVacationPage(container);
  }

  function pageHeader(title, subtitle) {
    const header = create("div", "addon-page-header");
    const copy = create("div");
    copy.append(create("p", "eyebrow", "Team Dashboard"), create("h1", "", title), create("p", "addon-subtitle", subtitle));
    header.append(copy);
    return header;
  }

  function renderContentReferencePage(container) {
    container.append(pageHeader("콘텐츠 레퍼런스", "참고할 콘텐츠와 활용 아이디어를 자유롭게 기록할 수 있습니다."));
    const wrap = create("div", "content-reference-table-wrap");
    const table = create("div", "content-reference-table");
    const head = create("div", "content-reference-head");
    ["주제", "URL", "아이디어", "활용 여부"].forEach((label) => head.append(create("div", "", label)));
    table.append(head);

    contentReferenceRows.forEach((row) => {
      const rowNode = create("div", `content-reference-row${row.used ? " is-used" : ""}`);
      const subjectCell = create("div", "content-reference-cell");
      const subjectInput = field("input", row.subject, "콘텐츠 레퍼런스 주제", (value) => {
        row.subject = value;
        persist(CONTENT_REFERENCE_KEY, contentReferenceRows);
      });
      subjectInput.placeholder = "주제 입력";
      subjectCell.append(subjectInput);

      const urlCell = create("div", "content-reference-cell content-reference-url-cell");
      const openLink = create("a", "content-reference-open-link", "이동 ↗");
      openLink.target = "_blank";
      openLink.rel = "noopener noreferrer";
      openLink.setAttribute("aria-label", "입력한 URL 새 창에서 열기");
      const syncOpenLink = (value) => {
        const target = contentReferenceUrl(value);
        if (target) {
          openLink.href = target;
          openLink.classList.remove("is-disabled");
          openLink.tabIndex = 0;
        } else {
          openLink.removeAttribute("href");
          openLink.classList.add("is-disabled");
          openLink.tabIndex = -1;
        }
      };
      const urlInput = field("input", row.url, "콘텐츠 레퍼런스 URL", (value) => {
        row.url = value;
        syncOpenLink(value);
        persist(CONTENT_REFERENCE_KEY, contentReferenceRows);
      });
      urlInput.type = "url";
      urlInput.placeholder = "https://";
      syncOpenLink(row.url);
      urlCell.append(urlInput, openLink);

      const ideaCell = create("div", "content-reference-cell");
      const ideaInput = field("textarea", row.idea, "콘텐츠 레퍼런스 활용 아이디어", (value) => {
        row.idea = value;
        persist(CONTENT_REFERENCE_KEY, contentReferenceRows);
      });
      ideaInput.rows = 2;
      ideaInput.placeholder = "아이디어 입력";
      ideaCell.append(ideaInput);

      const useCell = create("div", "content-reference-use-cell");
      const checkLabel = create("label", "content-reference-check");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = row.used;
      checkbox.setAttribute("aria-label", `${row.subject || "콘텐츠 레퍼런스"} 활용 여부`);
      checkLabel.append(checkbox, document.createTextNode("활용"));
      checkbox.addEventListener("change", () => {
        row.used = checkbox.checked;
        rowNode.classList.toggle("is-used", row.used);
        localStorage.setItem(CONTENT_REFERENCE_KEY, JSON.stringify(contentReferenceRows));
      });
      const remove = create("button", "content-reference-delete", "삭제");
      remove.type = "button";
      remove.addEventListener("click", () => {
        contentReferenceRows = contentReferenceRows.filter((item) => item.id !== row.id);
        localStorage.setItem(CONTENT_REFERENCE_KEY, JSON.stringify(contentReferenceRows));
        renderActivePage(container);
      });
      useCell.append(checkLabel, remove);
      rowNode.append(subjectCell, urlCell, ideaCell, useCell);
      table.append(rowNode);
    });

    wrap.append(table);
    const add = create("button", "addon-add-button", "+ 레퍼런스 추가");
    add.type = "button";
    add.addEventListener("click", () => {
      contentReferenceRows.push(normalizeContentReferenceRow({ id: crypto.randomUUID() }));
      localStorage.setItem(CONTENT_REFERENCE_KEY, JSON.stringify(contentReferenceRows));
      renderActivePage(container);
    });
    container.append(wrap, add);
  }

  function renderProcessPage(container) {
    container.append(pageHeader("BGF LIVE 업무 프로세스", "표의 모든 항목을 직접 수정할 수 있습니다."));
    const wrap = create("div", "workflow-table-wrap");
    const table = create("table", "workflow-table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["구분", "단계", "업무", "일정", "세부 내용", "관리"].forEach((label) => headRow.append(create("th", "", label)));
    head.append(headRow);
    const body = document.createElement("tbody");
    const spanAt = (index, key, parentKey) => {
      const same = (left, right) => left[key] === right[key] && (!parentKey || left[parentKey] === right[parentKey]);
      if (index > 0 && same(processRows[index - 1], processRows[index])) return 0;
      let span = 1;
      while (index + span < processRows.length && same(processRows[index], processRows[index + span])) span += 1;
      return span;
    };
    processRows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      const groupSpan = spanAt(rowIndex, "group");
      if (groupSpan) {
        const td = create("td", "workflow-merged-cell");
        td.rowSpan = groupSpan;
        const select = document.createElement("select");
        select.setAttribute("aria-label", `${row.group} 구분`);
        PROCESS_GROUPS.forEach((group) => {
          const option = document.createElement("option");
          option.value = group;
          option.textContent = group;
          option.selected = row.group === group;
          select.append(option);
        });
        select.addEventListener("change", () => {
          for (let offset = 0; offset < groupSpan; offset += 1) processRows[rowIndex + offset].group = select.value;
          localStorage.setItem(PROCESS_KEY, JSON.stringify(processRows));
          renderActivePage(container);
        });
        td.append(select);
        tr.append(td);
      }
      const phaseSpan = spanAt(rowIndex, "phase", "group");
      if (phaseSpan) {
        const td = create("td", "workflow-merged-cell");
        td.rowSpan = phaseSpan;
        td.append(field("input", row.phase, `${row.group} 단계`, (value) => {
          for (let offset = 0; offset < phaseSpan; offset += 1) processRows[rowIndex + offset].phase = value;
          persist(PROCESS_KEY, processRows);
        }));
        tr.append(td);
      }
      ["task", "timing", "detail"].forEach((key) => {
        const td = document.createElement("td");
        const input = field(key === "detail" ? "textarea" : "input", row[key], `${row.task || "업무"} ${key}`, (value) => {
          row[key] = value;
          persist(PROCESS_KEY, processRows);
        });
        td.append(input);
        tr.append(td);
      });
      const actions = document.createElement("td");
      const remove = create("button", "addon-delete-button", "삭제");
      remove.type = "button";
      remove.addEventListener("click", () => {
        processRows = processRows.filter((item) => item.id !== row.id);
        localStorage.setItem(PROCESS_KEY, JSON.stringify(processRows));
        renderActivePage(container);
      });
      actions.append(remove);
      tr.append(actions);
      body.append(tr);
    });
    table.append(head, body);
    wrap.append(table);
    const add = create("button", "addon-add-button", "+ 업무 행 추가");
    add.type = "button";
    add.addEventListener("click", () => {
      processRows.push({ id: crypto.randomUUID(), group: "기획 프로세스", phase: "", task: "", timing: "", detail: "" });
      localStorage.setItem(PROCESS_KEY, JSON.stringify(processRows));
      renderActivePage(container);
    });
    container.append(wrap, add);
  }

  function usedDates(dates) {
    return new Set(dates.map((date) => String(date || "").trim()).filter(Boolean)).size;
  }

  function vacationDateCell(row, type, index, page) {
    const td = create("td", "vacation-date-slot");
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.maxLength = 5;
    input.placeholder = "-";
    input.value = shortDate(row[type][index]);
    input.setAttribute("aria-label", `${row.name || "직원"} ${type === "annualDates" ? "연차" : "반차"} 사용일자 ${index + 1}`);
    input.addEventListener("input", () => {
      row[type][index] = input.value;
      persist(VACATION_KEY, vacationRows);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") input.blur();
    });
    input.addEventListener("blur", () => {
      row[type][index] = shortDate(input.value);
      localStorage.setItem(VACATION_KEY, JSON.stringify(vacationRows));
      syncVacationCalendar();
      renderActivePage(page);
    });
    td.append(input);
    return td;
  }

  function renderVacationPage(container) {
    const today = new Date();
    const dateLabel = `${today.getFullYear()}. ${today.getMonth() + 1}. ${today.getDate()}`;
    container.append(pageHeader(`${today.getFullYear()} 휴가 사용현황`, `기준일자 ${dateLabel} · 사용일을 입력하면 잔여 휴가가 자동 계산됩니다.`));
    const wrap = create("div", "vacation-table-wrap");
    const table = create("table", "vacation-table");
    const colgroup = document.createElement("colgroup");
    ["name", "allowance", "kind", ...Array(VACATION_DATE_SLOTS).fill("date"), "count", "used", "remaining", "manage"].forEach((name) => {
      const col = document.createElement("col");
      col.className = `vacation-col-${name}`;
      colgroup.append(col);
    });
    const head = document.createElement("thead");
    const trh = document.createElement("tr");
    ["성명", "연차\n총 개수", "구분"].forEach((label) => {
      const th = create("th", "", label);
      th.rowSpan = 2;
      trh.append(th);
    });
    const dateHeading = create("th", "vacation-date-heading", "사용일자");
    dateHeading.colSpan = VACATION_DATE_SLOTS;
    trh.append(dateHeading);
    ["사용\n개수", "사용\n합계", "잔여\n휴가", "관리"].forEach((label) => {
      const th = create("th", "", label);
      th.rowSpan = 2;
      trh.append(th);
    });
    const dateNumbers = document.createElement("tr");
    Array.from({ length: VACATION_DATE_SLOTS }, (_, index) => dateNumbers.append(create("th", "vacation-date-number", String(index + 1))));
    head.append(trh, dateNumbers);
    const body = document.createElement("tbody");
    vacationRows.forEach((row) => {
      const annualCount = usedDates(row.annualDates);
      const halfCount = usedDates(row.halfDates);
      const usedTotal = annualCount + halfCount * 0.5;
      const total = Number.parseFloat(row.total);
      const remaining = Number.isFinite(total) ? total - usedTotal : null;
      [
        { label: "연차", type: "annualDates", count: annualCount },
        { label: "반차", type: "halfDates", count: halfCount }
      ].forEach((line, lineIndex) => {
        const tr = document.createElement("tr");
        if (lineIndex === 0) {
          const nameCell = document.createElement("td"); nameCell.rowSpan = 2;
          nameCell.append(field("input", row.name, "성명", (value) => {
            row.name = value;
            persist(VACATION_KEY, vacationRows);
            syncVacationCalendar();
          })); tr.append(nameCell);
          const totalCell = create("td", "vacation-allowance"); totalCell.rowSpan = 2;
          const totalInput = field("input", row.total, `${row.name || "직원"} 연차 총 개수`, (value) => {
            row.total = value;
            persist(VACATION_KEY, vacationRows);
            const usedCell = tr.querySelector("[data-used-total]");
            const remainCell = tr.querySelector("[data-remaining]");
            const parsed = Number.parseFloat(value);
            if (usedCell) usedCell.textContent = usedTotal.toFixed(1);
            if (remainCell) remainCell.textContent = Number.isFinite(parsed) ? (parsed - usedTotal).toFixed(1) : "-";
          });
          totalInput.type = "number"; totalInput.min = "0"; totalInput.step = "0.5"; totalCell.append(totalInput); tr.append(totalCell);
        }
        tr.append(create("td", `vacation-kind vacation-kind-${line.label === "연차" ? "annual" : "half"}`, line.label));
        for (let index = 0; index < VACATION_DATE_SLOTS; index += 1) tr.append(vacationDateCell(row, line.type, index, container));
        tr.append(create("td", "vacation-count", String(line.count)));
        if (lineIndex === 0) {
          const usedCell = create("td", "vacation-total", usedTotal.toFixed(1)); usedCell.rowSpan = 2; usedCell.dataset.usedTotal = "true"; tr.append(usedCell);
          const remainingCell = create("td", `vacation-remaining ${remaining !== null && remaining < 0 ? "is-negative" : ""}`, remaining === null ? "-" : remaining.toFixed(1));
          remainingCell.rowSpan = 2; remainingCell.dataset.remaining = "true"; tr.append(remainingCell);
          const actions = document.createElement("td"); actions.rowSpan = 2;
          const remove = create("button", "addon-delete-button", "삭제"); remove.type = "button";
          remove.addEventListener("click", () => {
            vacationRows = vacationRows.filter((item) => item.id !== row.id);
            localStorage.setItem(VACATION_KEY, JSON.stringify(vacationRows));
            syncVacationCalendar();
            renderActivePage(container);
          });
          actions.append(remove); tr.append(actions);
        }
        body.append(tr);
      });
    });
    table.append(colgroup, head, body); wrap.append(table);
    const add = create("button", "addon-add-button", "+ 구성원 추가"); add.type = "button";
    add.addEventListener("click", () => {
      vacationRows.push(normalizeVacationRow({ id: crypto.randomUUID() }));
      localStorage.setItem(VACATION_KEY, JSON.stringify(vacationRows));
      syncVacationCalendar();
      renderActivePage(container);
    });
    container.append(wrap, add);
  }

  window.addEventListener("dashboard-shared-state", (event) => {
    const { key, value } = event.detail || {};
    try {
      if (key === PROCESS_KEY) processRows = normalizeProcessRows(JSON.parse(value));
      if (key === CONTENT_REFERENCE_KEY) contentReferenceRows = JSON.parse(value).map(normalizeContentReferenceRow);
      if (key === VACATION_KEY) {
        vacationRows = JSON.parse(value).map(normalizeVacationRow);
        syncVacationCalendar();
      }
      const page = document.querySelector(".addon-page");
      if (page && ((key === PROCESS_KEY && activePage === "process") || (key === VACATION_KEY && activePage === "vacation") || (key === CONTENT_REFERENCE_KEY && activePage === "content-reference"))) {
        renderActivePage(page);
      }
    } catch (error) {
      console.warn("추가 페이지 공동 데이터 반영 실패", error);
    }
  });

  const observer = new MutationObserver(ensureTabs);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  ensureTabs();
})();
