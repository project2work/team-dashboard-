import { firebaseConfig } from "./firebase-config.js?v=20260722-1";

const DASHBOARD_MODULE = "./assets/index-DtvQMByN.js?v=20260722-1";
const COLLECTION = "team-dashboard-state";
const SHARED_LOGIN_EMAIL = "dashboard@project2work.com";
const BACKUP_KEY = "teamDashboardBackupBeforeSharedV1";
const LATEST_BACKUP_KEY = "teamDashboardBackupLatestV1";
const sheetIdAliases = new Map();
const SHARED_KEYS = [
  "teamDashboardSheetSnapshotV5",
  "teamDashboardManualStateV2",
  "teamDashboardChecksV2",
  "teamDashboardCheckMemoV1",
  "teamDashboardManualEventsV1",
  "teamDashboardWeeklyStatusV1",
  "teamDashboardWeeklyGlobalMemoV1",
  "teamDashboardResourcesV1",
  "teamDashboardInstagramPlanV1"
];

const configured = firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith("여기에") &&
  firebaseConfig.projectId &&
  !firebaseConfig.projectId.startsWith("여기에");

async function loadDashboard() {
  await import(DASHBOARD_MODULE);
}

function showStatus(message, type = "ok") {
  let badge = document.getElementById("shared-sync-status");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "shared-sync-status";
    document.body.appendChild(badge);
  }
  badge.className = `shared-sync-status ${type}`;
  badge.textContent = message;
  window.setTimeout(() => badge.classList.add("is-quiet"), 2400);
}

function waitForInitialAuth(authSdk, auth) {
  return new Promise(resolve => {
    let unsubscribe = () => {};
    unsubscribe = authSdk.onAuthStateChanged(auth, user => {
      unsubscribe();
      resolve(user);
    });
  });
}

async function requireSharedPassword(authSdk, auth) {
  await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
  const currentUser = await waitForInitialAuth(authSdk, auth);
  if (currentUser && !currentUser.isAnonymous && currentUser.email === SHARED_LOGIN_EMAIL) {
    return currentUser;
  }
  if (currentUser) await authSdk.signOut(auth);

  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "shared-login-overlay";
    overlay.innerHTML = `
      <form class="shared-login-card" autocomplete="on">
        <div class="shared-login-folder" aria-hidden="true">📁</div>
        <h1>Team Dashboard</h1>
        <p>공용 비밀번호를 입력해주세요.</p>
        <label class="shared-login-label" for="shared-dashboard-password">비밀번호</label>
        <input
          id="shared-dashboard-password"
          class="shared-login-input"
          type="password"
          autocomplete="current-password"
          placeholder="비밀번호 입력"
          required
        />
        <button class="shared-login-button" type="submit">들어가기</button>
        <p class="shared-login-error" role="alert" aria-live="polite"></p>
      </form>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector("form");
    const input = overlay.querySelector("input");
    const button = overlay.querySelector("button");
    const errorText = overlay.querySelector(".shared-login-error");
    input.focus();

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const password = input.value;
      if (!password) return;

      button.disabled = true;
      button.textContent = "확인 중...";
      errorText.textContent = "";
      try {
        const credential = await authSdk.signInWithEmailAndPassword(auth, SHARED_LOGIN_EMAIL, password);
        overlay.classList.add("is-complete");
        window.setTimeout(() => overlay.remove(), 180);
        resolve(credential.user);
      } catch (error) {
        console.error("공용 비밀번호 확인 실패", error);
        input.select();
        errorText.textContent = error?.code === "auth/too-many-requests"
          ? "시도 횟수가 많습니다. 잠시 후 다시 시도해주세요."
          : "비밀번호가 맞지 않습니다.";
      } finally {
        button.disabled = false;
        button.textContent = "들어가기";
      }
    });
  });
}

function parseJson(value, fallback) {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeArrays(localItems, remoteItems) {
  const keyed = new Map();
  const unkeyed = new Map();

  [...localItems, ...remoteItems].forEach(item => {
    const id = isRecord(item) && item.id !== undefined && item.id !== null
      ? String(item.id)
      : "";
    if (id) {
      const previous = keyed.get(id);
      keyed.set(id, isRecord(previous) && isRecord(item) ? { ...previous, ...item } : item);
      return;
    }

    let signature;
    try {
      signature = JSON.stringify(item);
    } catch {
      signature = String(item);
    }
    unkeyed.set(signature, item);
  });

  return [...keyed.values(), ...unkeyed.values()];
}

function normalizeCampaignText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\[\](){}]/g, "")
    .trim();
}

function campaignSignature(item) {
  if (!isRecord(item)) return "";
  const rawId = String(item.id || "").trim();
  const idParts = rawId.split("|").map(normalizeCampaignText).filter(Boolean);
  if (idParts.length >= 4) {
    // 첫 조각은 같은 시트를 가리키는 이름이 버전마다 달라질 수 있으므로 제외합니다.
    // 행 번호와 나머지 원본 값은 유지해 동일 제품의 서로 다른 인플루언서를 구분합니다.
    return `sheet-row|${idParts.slice(1).join("|")}`;
  }

  const section = normalizeCampaignText(item.section);
  const scheduledMonth = Array.isArray(item.schedule)
    ? item.schedule.map(entry => String(entry?.date || "").slice(0, 7)).find(Boolean)
    : "";
  const month = normalizeCampaignText(item.campaignMonth || String(item.publishDate || "").slice(0, 7) || scheduledMonth);
  const category = normalizeCampaignText(item.category || item.platform || item.contentCategory);
  const product = normalizeCampaignText(item.product);
  const detail = normalizeCampaignText(item.detail);
  const title = normalizeCampaignText(item.title);
  const accountText = [item.title, item.product, item.detail, item.keyword]
    .map(value => String(value || ""))
    .join(" ");
  const account = accountText.match(/@[a-z0-9._-]+/i)?.[0]?.toLowerCase() || "";
  if (!section || (!product && !title)) return "";
  return [section, month, category, account || product || title, detail].join("|");
}

function mergeSchedule(localSchedule, remoteSchedule) {
  const merged = new Map();
  [...(Array.isArray(localSchedule) ? localSchedule : []), ...(Array.isArray(remoteSchedule) ? remoteSchedule : [])]
    .forEach(entry => {
      if (!isRecord(entry)) return;
      const key = normalizeCampaignText(entry.label) || JSON.stringify(entry);
      const previous = merged.get(key) || {};
      merged.set(key, { ...previous, ...entry });
    });
  return [...merged.values()];
}

function mergeCampaignEntry(localEntry, remoteEntry, canonicalId) {
  const merged = { ...localEntry };
  Object.entries(remoteEntry).forEach(([key, value]) => {
    const hasUsefulValue = Array.isArray(value)
      ? value.length > 0
      : value !== "" && value !== null && value !== undefined;
    if (hasUsefulValue) merged[key] = value;
  });
  merged.id = canonicalId;
  merged.schedule = mergeSchedule(localEntry.schedule, remoteEntry.schedule);
  const progressValues = [localEntry.completedProgressIndex, remoteEntry.completedProgressIndex]
    .filter(value => Number.isInteger(value));
  if (progressValues.length) merged.completedProgressIndex = Math.max(...progressValues);
  return merged;
}

function mergeSheetItems(localItems, remoteItems) {
  sheetIdAliases.clear();
  const campaigns = new Map();
  const unkeyed = new Map();

  const addItem = (item, remote = false) => {
    const signature = campaignSignature(item);
    if (!signature) {
      let fallback;
      try {
        fallback = JSON.stringify(item);
      } catch {
        fallback = String(item);
      }
      unkeyed.set(fallback, item);
      return;
    }

    const previous = campaigns.get(signature);
    if (!previous) {
      campaigns.set(signature, item);
      return;
    }

    const previousId = previous?.id ? String(previous.id) : "";
    const incomingId = item?.id ? String(item.id) : "";
    const canonicalId = remote && incomingId ? incomingId : (previousId || incomingId);
    if (previousId && previousId !== canonicalId) sheetIdAliases.set(previousId, canonicalId);
    if (incomingId && incomingId !== canonicalId) sheetIdAliases.set(incomingId, canonicalId);
    campaigns.set(signature, mergeCampaignEntry(previous, item, canonicalId));
  };

  localItems.forEach(item => addItem(item, false));
  remoteItems.forEach(item => addItem(item, true));
  return [...campaigns.values(), ...unkeyed.values()];
}

function resolveSheetId(id) {
  let current = String(id || "");
  const visited = new Set();
  while (sheetIdAliases.has(current) && !visited.has(current)) {
    visited.add(current);
    current = sheetIdAliases.get(current);
  }
  return current;
}

function remapManualState(entries) {
  const result = {};
  Object.entries(entries).forEach(([id, entry]) => {
    const canonicalId = resolveSheetId(id) || id;
    const previous = result[canonicalId];
    if (!isRecord(previous) || !isRecord(entry)) {
      result[canonicalId] = entry;
      return;
    }
    result[canonicalId] = {
      ...previous,
      ...entry,
      dueDates: {
        ...(isRecord(previous.dueDates) ? previous.dueDates : {}),
        ...(isRecord(entry.dueDates) ? entry.dueDates : {})
      },
      completedProgressIndex: Math.max(
        Number.isInteger(previous.completedProgressIndex) ? previous.completedProgressIndex : -1,
        Number.isInteger(entry.completedProgressIndex) ? entry.completedProgressIndex : -1
      )
    };
  });
  return result;
}

function mergeRecordMap(localValue, remoteValue, nestedKeys = []) {
  const result = { ...localValue };
  Object.entries(remoteValue).forEach(([entryKey, remoteEntry]) => {
    const localEntry = result[entryKey];
    if (!isRecord(localEntry) || !isRecord(remoteEntry)) {
      result[entryKey] = remoteEntry;
      return;
    }

    const mergedEntry = { ...localEntry, ...remoteEntry };
    nestedKeys.forEach(nestedKey => {
      if (isRecord(localEntry[nestedKey]) || isRecord(remoteEntry[nestedKey])) {
        mergedEntry[nestedKey] = {
          ...(isRecord(localEntry[nestedKey]) ? localEntry[nestedKey] : {}),
          ...(isRecord(remoteEntry[nestedKey]) ? remoteEntry[nestedKey] : {})
        };
      }
    });
    result[entryKey] = mergedEntry;
  });
  return result;
}

function mergeSharedValue(key, localRaw, remoteRaw) {
  if (key === "teamDashboardSheetSnapshotV5") {
    const localItems = parseJson(localRaw, []);
    const remoteItems = parseJson(remoteRaw, []);
    if (Array.isArray(localItems) && Array.isArray(remoteItems)) {
      return JSON.stringify(mergeSheetItems(localItems, remoteItems));
    }
  }

  if (remoteRaw === null || remoteRaw === undefined) return localRaw;
  if (localRaw === null || localRaw === undefined) return remoteRaw;

  if (key === "teamDashboardCheckMemoV1" || key === "teamDashboardWeeklyGlobalMemoV1") {
    return remoteRaw.trim() ? remoteRaw : localRaw;
  }

  const localValue = parseJson(localRaw, null);
  const remoteValue = parseJson(remoteRaw, null);
  if (localValue === null || remoteValue === null) return remoteRaw || localRaw;

  if ([
    "teamDashboardChecksV2",
    "teamDashboardManualEventsV1",
    "teamDashboardResourcesV1"
  ].includes(key) && Array.isArray(localValue) && Array.isArray(remoteValue)) {
    return JSON.stringify(mergeArrays(localValue, remoteValue));
  }

  if (key === "teamDashboardManualStateV2" && isRecord(localValue) && isRecord(remoteValue)) {
    return JSON.stringify(remapManualState(mergeRecordMap(localValue, remoteValue, ["dueDates"])));
  }

  if (key === "teamDashboardWeeklyStatusV1" && isRecord(localValue) && isRecord(remoteValue)) {
    return JSON.stringify(mergeRecordMap(localValue, remoteValue, ["rows"]));
  }

  if (key === "teamDashboardInstagramPlanV1" && isRecord(localValue) && isRecord(remoteValue)) {
    const localRows = Array.isArray(localValue.rows) ? localValue.rows : [];
    const remoteRows = Array.isArray(remoteValue.rows) ? remoteValue.rows : [];
    return JSON.stringify({
      ...localValue,
      ...remoteValue,
      rows: mergeArrays(localRows, remoteRows),
      note: String(remoteValue.note || "").trim() ? remoteValue.note : (localValue.note || "")
    });
  }

  if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
    return JSON.stringify(mergeArrays(localValue, remoteValue));
  }

  if (isRecord(localValue) && isRecord(remoteValue)) {
    return JSON.stringify({ ...localValue, ...remoteValue });
  }

  return remoteRaw;
}

if (!configured) {
  console.warn("Firebase 설정이 없어 이 브라우저에만 저장됩니다.");
  await loadDashboard();
  showStatus("공동 저장 설정 필요", "warning");
} else {
  try {
    const appSdk = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js");
    const authSdk = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js");
    const storeSdk = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js");

    const app = appSdk.initializeApp(firebaseConfig);
    const auth = authSdk.getAuth(app);
    await requireSharedPassword(authSdk, auth);

    const db = storeSdk.getFirestore(app);
    const stateCollection = storeSdk.collection(db, COLLECTION);
    const clientId = sessionStorage.getItem("teamDashboardClientId") || crypto.randomUUID();
    sessionStorage.setItem("teamDashboardClientId", clientId);

    const nativeSetItem = Storage.prototype.setItem;
    const pendingWrites = new Map();
    let applyingRemote = false;

    const localStateBeforeSync = Object.fromEntries(
      SHARED_KEYS
        .map(key => [key, localStorage.getItem(key)])
        .filter(([, value]) => value !== null)
    );
    const backupPayload = JSON.stringify({
      createdAt: new Date().toISOString(),
      state: localStateBeforeSync
    });
    if (!localStorage.getItem(BACKUP_KEY)) {
      nativeSetItem.call(localStorage, BACKUP_KEY, backupPayload);
    }
    nativeSetItem.call(localStorage, LATEST_BACKUP_KEY, backupPayload);

    async function writeSharedValue(key, value) {
      await storeSdk.setDoc(storeSdk.doc(db, COLLECTION, key), {
        value,
        updatedBy: clientId,
        updatedAt: storeSdk.serverTimestamp()
      });
    }

    function scheduleWrite(key, value) {
      window.clearTimeout(pendingWrites.get(key));
      pendingWrites.set(key, window.setTimeout(async () => {
        pendingWrites.delete(key);
        try {
          await writeSharedValue(key, value);
          showStatus("공동 저장 완료");
        } catch (error) {
          console.error("공동 저장 실패", error);
          showStatus("공동 저장 실패", "error");
        }
      }, 350));
    }

    Storage.prototype.setItem = function patchedSetItem(key, value) {
      const stringValue = String(value);
      const previousValue = this === localStorage ? this.getItem(key) : null;
      nativeSetItem.call(this, key, stringValue);
      if (this === localStorage && SHARED_KEYS.includes(key) && !applyingRemote && previousValue !== stringValue) {
        scheduleWrite(key, stringValue);
      }
    };

    const initialSnapshot = await storeSdk.getDocs(stateCollection);
    const remoteState = new Map();
    initialSnapshot.forEach(snapshot => {
      const value = snapshot.data()?.value;
      if (SHARED_KEYS.includes(snapshot.id) && typeof value === "string") {
        remoteState.set(snapshot.id, value);
      }
    });

    const mergedWrites = [];
    applyingRemote = true;
    SHARED_KEYS.forEach(key => {
      const localValue = localStateBeforeSync[key] ?? null;
      const remoteValue = remoteState.get(key) ?? null;
      // 공용 데이터가 있으면 그것을 최신 원본으로 사용합니다.
      // 로컬과 매번 합치면 다른 컴퓨터의 오래된 항목이 삭제 후 다시 살아날 수 있습니다.
      const sharedValue = remoteValue !== null
        ? (key === "teamDashboardSheetSnapshotV5"
            ? mergeSharedValue(key, null, remoteValue)
            : remoteValue)
        : localValue;
      if (sharedValue === null || sharedValue === undefined) return;

      nativeSetItem.call(localStorage, key, sharedValue);
      if (sharedValue !== remoteValue) {
        mergedWrites.push(writeSharedValue(key, sharedValue));
      }
    });
    applyingRemote = false;
    await Promise.all(mergedWrites);

    await loadDashboard();
    // 빈 배열도 유효한 공용 상태입니다. 앱의 기본 예시 항목이 잠시 생성되더라도
    // 초기 공용 값을 다시 전달해 전체 삭제 상태까지 정확히 반영합니다.
    window.setTimeout(() => {
      remoteState.forEach((value, key) => {
        window.dispatchEvent(new CustomEvent("dashboard-shared-state", {
          detail: { key, value }
        }));
      });
    }, 0);
    showStatus(Object.keys(localStateBeforeSync).length
      ? "기존 자료 보존 후 공동 저장 연결됨"
      : "공동 저장 연결됨");

    storeSdk.onSnapshot(stateCollection, snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === "removed") return;
        const key = change.doc.id;
        const data = change.doc.data();
        if (!SHARED_KEYS.includes(key) || typeof data?.value !== "string") return;
        if (data.updatedBy === clientId || localStorage.getItem(key) === data.value) return;

        applyingRemote = true;
        nativeSetItem.call(localStorage, key, data.value);
        applyingRemote = false;
        window.dispatchEvent(new CustomEvent("dashboard-shared-state", {
          detail: { key, value: data.value }
        }));
        showStatus("다른 컴퓨터의 변경 반영됨");
      });
    }, error => {
      console.error("공동 데이터 수신 실패", error);
      showStatus("공동 연결 끊김", "error");
    });
  } catch (error) {
    console.error("공동 저장 연결 실패", error);
    await loadDashboard();
    showStatus("공동 저장 연결 실패", "error");
  }
}
