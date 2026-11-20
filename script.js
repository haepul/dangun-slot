/* No imports or fetch: this script also works when index.html is opened directly. */
(function () {
  "use strict";

  const SYMBOLS = Object.freeze([
    Object.freeze({ id: "mugwort", name: "쑥", weight: 6, message: "쑥이 모두 모였어요!" }),
    Object.freeze({ id: "garlic", name: "마늘", weight: 6, message: "마늘이 모두 모였어요!" }),
    Object.freeze({ id: "tiger", name: "호랑이", weight: 4, message: "호랑이가 모두 모였어요!" }),
    Object.freeze({ id: "bear", name: "곰", weight: 4, message: "곰이 모두 모였어요!" }),
    Object.freeze({ id: "dangun", name: "단군", weight: 0, message: "단군 등장! 축하합니다!" })
  ]);
  // One configuration drives outcome selection, the visible table and simulation.
  const PROBABILITIES = Object.freeze({ match: 0.20, dangunOverall: 0.02 });
  const PITY_LIMIT = 30;
  const STORAGE_KEY = "dangun-slot-progress-v1";
  const DANGUN_GIVEN_MATCH = PROBABILITIES.dangunOverall / PROBABILITIES.match;
  const TOTAL_WEIGHT = SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);
  const symbolProbability = index => index === 4 ? PROBABILITIES.dangunOverall
    : (PROBABILITIES.match - PROBABILITIES.dangunOverall) * SYMBOLS[index].weight / TOTAL_WEIGHT;

  function isTriple(symbols) {
    return symbols[0] === symbols[1] && symbols[1] === symbols[2];
  }

  // The injected RNG is only for development tests; normal play uses Math.random.
  // Every spin starts here exactly once, before any animation is scheduled.
  function decideResult(random = Math.random) {
    const matched = random() < PROBABILITIES.match;
    if (matched) {
      let selected = 4;
      if (random() >= DANGUN_GIVEN_MATCH) {
        let ticket = random() * TOTAL_WEIGHT;
        for (let i = 0; i < 4; i += 1) {
          ticket -= SYMBOLS[i].weight;
          if (ticket < 0) {
            selected = i;
            break;
          }
        }
      }
      return { matched: true, symbols: [selected, selected, selected] };
    }

    // Rejection sampling gives equal weight to all 120 non-triple combinations.
    // Two matching symbols are allowed. No accidental triple can escape this loop.
    let symbols;
    do {
      symbols = Array.from({ length: 3 }, () => Math.floor(random() * SYMBOLS.length));
    } while (isTriple(symbols));
    return { matched: false, symbols };
  }

  function resultMessage(result) {
    return result.matched ? SYMBOLS[result.symbols[0]].message : "다시 도전해 보세요!";
  }

  function decideSpin(misses, random = Math.random) {
    if (!Number.isInteger(misses) || misses < 0 || misses >= PITY_LIMIT) {
      throw new RangeError("천장 횟수는 0~29 사이의 정수여야 합니다.");
    }
    const guaranteed = misses === PITY_LIMIT - 1;
    // The guaranteed spin never calls RNG or changes an already drawn outcome.
    const result = guaranteed ? { matched: true, symbols: [4, 4, 4] } : decideResult(random);
    const dangun = result.matched && result.symbols[0] === 4;
    return { result, guaranteed, misses: dangun ? 0 : misses + 1 };
  }

  function simulatePity(rounds = 100000, random = Math.random, print = true) {
    if (!Number.isSafeInteger(rounds) || rounds < 100000) throw new RangeError("100,000회 이상 실행해 주세요.");
    let misses = 0, dangunCount = 0, guaranteedCount = 0, maxGap = 0, gap = 0;
    for (let i = 0; i < rounds; i += 1) {
      const spin = decideSpin(misses, random);
      misses = spin.misses;
      gap += 1;
      if (spin.result.matched && spin.result.symbols[0] === 4) {
        dangunCount += 1;
        if (spin.guaranteed) guaranteedCount += 1;
        maxGap = Math.max(maxGap, gap);
        gap = 0;
      }
      if (gap >= PITY_LIMIT) throw new Error("천장 보장 위반");
    }
    const report = { rounds, dangunCount, naturalCount: dangunCount - guaranteedCount, guaranteedCount,
      actualPercent: dangunCount / rounds * 100,
      expectedLongRunPercent: PROBABILITIES.dangunOverall / (1 - (1 - PROBABILITIES.dangunOverall) ** PITY_LIMIT) * 100,
      maxGap, remainingMisses: misses };
    if (print) console.table(report);
    return report;
  }

  // Console: DangunSlot.simulate(1000000). This never touches the game UI.
  // Node: require('./script.js').simulate(1000000).
  function simulate(rounds = 100000, random = Math.random, print = true) {
    if (!Number.isSafeInteger(rounds) || rounds < 100000) {
      throw new RangeError("확률 검증은 100,000회 이상의 정수 횟수로 실행해 주세요.");
    }
    const counts = SYMBOLS.map(() => 0);
    let matches = 0;
    let accidentalTriples = 0;
    for (let i = 0; i < rounds; i += 1) {
      const result = decideResult(random);
      if (result.matched) {
        matches += 1;
        counts[result.symbols[0]] += 1;
      } else if (isTriple(result.symbols)) {
        accidentalTriples += 1;
      }
    }
    const nonDangunMatches = matches - counts[4];
    const rate = (count, total) => total ? count / total * 100 : 0;
    const rows = [
      { result: "3칸 일치", count: matches, actualPercent: rate(matches, rounds), expectedPercent: PROBABILITIES.match * 100, denominator: "전체 회전" },
      { result: "3칸 불일치", count: rounds - matches, actualPercent: rate(rounds - matches, rounds), expectedPercent: (1 - PROBABILITIES.match) * 100, denominator: "전체 회전" },
      ...SYMBOLS.map((symbol, i) => ({
        result: `${symbol.name} × 3`, count: counts[i], actualPercent: rate(counts[i], rounds),
        expectedPercent: symbolProbability(i) * 100, denominator: "전체 회전"
      })),
      { result: "일치 중 단군", count: counts[4], actualPercent: rate(counts[4], matches), expectedPercent: DANGUN_GIVEN_MATCH * 100, denominator: "일치 회전" },
      ...SYMBOLS.slice(0, 4).map((symbol, i) => ({
        result: `단군 제외 일치 중 ${symbol.name}`, count: counts[i], actualPercent: rate(counts[i], nonDangunMatches),
        expectedPercent: symbol.weight / TOTAL_WEIGHT * 100, denominator: "단군 제외 일치 회전"
      }))
    ];
    // Five standard errors is a generous statistical smoke check, not a promise
    // that any finite random sample will equal its configured probability.
    const checks = rows.map(row => {
      const total = row.denominator === "전체 회전" ? rounds : row.denominator === "일치 회전" ? matches : nonDangunMatches;
      const p = row.expectedPercent / 100;
      const standardError = total ? Math.sqrt(p * (1 - p) / total) * 100 : Infinity;
      return { result: row.result, withinFiveStandardErrors: total > 0 && Math.abs(row.actualPercent - row.expectedPercent) <= 5 * standardError };
    });
    const report = { rounds, matches, counts, accidentalTriples, rows, checks,
      passed: accidentalTriples === 0 && checks.every(check => check.withinFiveStandardErrors) };
    if (print) {
      console.table(rows);
      console.log("불일치 분기의 3칸 일치 오류:", accidentalTriples);
      console.log("통계 검증 (기대값 ±5 표준오차):", report.passed ? "통과" : "표본 확인 필요");
    }
    return report;
  }

  const api = Object.freeze({ symbols: SYMBOLS, probabilities: PROBABILITIES, pityLimit: PITY_LIMIT,
    symbolProbability, decideResult, decideSpin, resultMessage, simulate, simulatePity });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined") return;
  window.DangunSlot = api;

  const percent = value => `${Number((value * 100).toFixed(2))}%`;
  const probabilityList = document.getElementById("probability-list");
  SYMBOLS.forEach((symbol, index) => {
    const row = document.createElement("li");
    if (index === 4) row.className = "dangun-rate";
    const icon = document.createElement("img");
    icon.src = `assets/${symbol.id}.svg`;
    icon.alt = "";
    const label = document.createElement("span");
    label.textContent = `${symbol.name} × 3`;
    const value = document.createElement("strong");
    value.textContent = percent(symbolProbability(index));
    row.append(icon, label, value);
    probabilityList.append(row);
  });
  document.getElementById("match-probability").textContent = percent(PROBABILITIES.match);
  document.getElementById("miss-probability").textContent = percent(1 - PROBABILITIES.match);
  document.getElementById("dangun-probability").textContent = percent(PROBABILITIES.dangunOverall);

  const button = document.getElementById("spin-button");
  const reels = document.querySelector(".reels");
  const images = Array.from(document.querySelectorAll(".slot img"));
  const labels = Array.from(document.querySelectorAll(".symbol-name"));
  const slots = Array.from(document.querySelectorAll(".slot"));
  const message = document.getElementById("result-message");
  const outcome = document.getElementById("outcome");
  const outcomeImage = document.getElementById("outcome-image");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stopTimes = [1000, 1200, 1400];
  let spinning = false;
  let finishOutcome = null;
  let pendingWrite = null;
  const pityText = document.getElementById("pity-status");
  const pityProgress = document.getElementById("pity-progress");
  const storageNote = document.getElementById("storage-note");

  function readProgress() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { version: 1, spins: 0, misses: 0, last: null };
    const state = JSON.parse(raw);
    if (!state || state.version !== 1 || !Number.isSafeInteger(state.spins) || state.spins < 0 ||
        !Number.isInteger(state.misses) || state.misses < 0 || state.misses >= PITY_LIMIT) {
      throw new Error("저장된 천장 기록을 읽을 수 없어요.");
    }
    if (state.spins === 0) {
      if (state.last !== null || state.misses !== 0) throw new Error("천장 기록을 확인해 주세요.");
    } else {
      const last = state.last;
      const result = last && last.result;
      if (!result || typeof last.guaranteed !== "boolean" || typeof result.matched !== "boolean" ||
          !Array.isArray(result.symbols) || result.symbols.length !== 3 ||
          !result.symbols.every(i => Number.isInteger(i) && i >= 0 && i < SYMBOLS.length) ||
          result.matched !== isTriple(result.symbols)) throw new Error("최근 결과를 읽을 수 없어요.");
      const dangun = result.matched && result.symbols[0] === 4;
      if ((last.guaranteed && !dangun) || (dangun ? state.misses !== 0 : state.misses < 1) ||
          state.misses > state.spins) throw new Error("천장 기록을 확인해 주세요.");
    }
    return state;
  }

  function renderPity(state) {
    pityText.textContent = state.misses === PITY_LIMIT - 1 ? "다음 회전은 단군 확정!" : `단군 천장까지 ${PITY_LIMIT - state.misses}회`;
    pityProgress.value = state.misses;
    pityProgress.setAttribute("aria-valuetext", `단군 없이 ${state.misses}회, 천장까지 ${PITY_LIMIT - state.misses}회`);
    storageNote.textContent = "이 브라우저에 횟수를 저장해요.";
  }

  async function commitSpin() {
    const transaction = () => {
      const current = readProgress();
      if (pendingWrite && JSON.stringify(current) !== pendingWrite.base) {
        throw new Error("다른 창에서 기록이 바뀌었어요. 새로고침 후 이어 주세요.");
      }
      if (!pendingWrite) {
        const spin = decideSpin(current.misses);
        pendingWrite = { base: JSON.stringify(current), state: { version: 1, spins: current.spins + 1,
          misses: spin.misses, last: { result: spin.result, guaranteed: spin.guaranteed } } };
      }
      // Result and counter are a single write, committed before any presentation.
      // Failed writes retain the exact result for retry; retry never redraws.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingWrite.state));
      const saved = pendingWrite.state;
      pendingWrite = null;
      renderPity(saved);
      return saved.last;
    };
    return navigator.locks ? navigator.locks.request(STORAGE_KEY, transaction) : transaction();
  }

  try {
    const saved = readProgress();
    renderPity(saved);
    if (saved.last) {
      saved.last.result.symbols.forEach((symbol, i) => showSymbol(i, symbol));
      message.textContent = resultMessage(saved.last.result);
    }
  } catch (error) {
    pityText.textContent = "천장 기록 확인 필요";
    storageNote.textContent = "기록을 불러오지 못했어요. 저장 설정을 확인한 뒤 다시 시도해 주세요.";
  }

  window.addEventListener("storage", event => {
    if ((event.key === STORAGE_KEY || event.key === null) && !spinning && !pendingWrite) {
      try { renderPity(readProgress()); }
      catch { storageNote.textContent = "천장 기록을 다시 확인해 주세요."; }
    }
  });

  function closeOutcome() {
    if (!outcome.open) return;
    outcome.close();
    if (finishOutcome) finishOutcome();
  }
  document.getElementById("outcome-close").addEventListener("click", closeOutcome);
  outcome.addEventListener("cancel", event => {
    event.preventDefault();
    closeOutcome();
  });

  // Keep all five illustrations decoded in memory before the first animation.
  const preload = SYMBOLS.map(symbol => {
    const image = new Image();
    image.src = `assets/${symbol.id}.svg`;
    return image;
  });

  function showSymbol(reelIndex, symbolIndex) {
    const symbol = SYMBOLS[symbolIndex];
    const source = `assets/${symbol.id}.svg`;
    if (images[reelIndex].getAttribute("src") !== source) images[reelIndex].src = source;
    images[reelIndex].alt = symbol.name;
    labels[reelIndex].textContent = symbol.name;
    slots[reelIndex].replaceChildren(images[reelIndex], labels[reelIndex]);
    slots[reelIndex].classList.remove("rolling");
  }

  // Each strip has the preselected result at the top and the current picture
  // at the bottom. Moving the whole strip down makes the pictures roll past.
  // Intermediate pictures are deterministic and never consume randomness.
  function createStrip(reelIndex, finalSymbol, steps) {
    const track = document.createElement("div");
    track.className = "reel-track";
    track.setAttribute("aria-hidden", "true");
    for (let index = 0; index <= steps; index += 1) {
      const cell = document.createElement("div");
      cell.className = "reel-cell";
      const image = document.createElement("img");
      const label = document.createElement("span");
      const symbol = SYMBOLS[index === 0 ? finalSymbol : (steps - index + reelIndex * 2) % SYMBOLS.length];
      image.src = index === steps ? images[reelIndex].src : `assets/${symbol.id}.svg`;
      image.alt = "";
      image.width = 200;
      image.height = 200;
      image.draggable = false;
      label.className = "symbol-name";
      label.textContent = index === steps ? labels[reelIndex].textContent : symbol.name;
      cell.append(image, label);
      track.append(cell);
    }
    track.style.transform = `translateY(${-steps * 100}%)`;
    slots[reelIndex].classList.add("rolling");
    slots[reelIndex].replaceChildren(track);
    return track;
  }

  button.addEventListener("click", async () => {
    if (spinning) return;
    const returnFocus = document.activeElement === button;
    spinning = true;
    button.disabled = true;
    button.textContent = "돌아가는 중…";
    reels.setAttribute("aria-busy", "true");
    message.textContent = "그림을 모으고 있어요…";

    let savedSpin;
    try {
      savedSpin = await commitSpin();
    } catch (error) {
      spinning = false;
      button.disabled = false;
      button.textContent = pendingWrite ? "저장 다시 시도" : "다시 시도";
      reels.setAttribute("aria-busy", "false");
      message.textContent = "기록을 저장하지 못해 회전을 멈췄어요.";
      storageNote.textContent = error.message.includes("다른 창") ? error.message : "브라우저 저장 설정을 확인한 뒤 다시 시도해 주세요.";
      if (returnFocus) button.focus({ preventScroll: true });
      return;
    }
    const { result, guaranteed } = savedSpin;
    if (guaranteed) message.textContent = "서른 번째 약속, 단군이 찾아와요!";
    const steps = [10, 12, 14];
    const tracks = slots.map((slot, i) => reducedMotion.matches ? null : createStrip(i, result.symbols[i], steps[i]));
    const start = performance.now();
    const stopped = [false, false, false];

    function displayOutcome() {
      const isDangun = result.matched && result.symbols[0] === 4;
      reels.setAttribute("aria-busy", "false");
      message.textContent = resultMessage(result);
      button.textContent = "이야기 보는 중…";
      outcome.dataset.kind = isDangun ? "dangun" : result.matched ? "success" : "failure";
      document.getElementById("dangun-scene").hidden = !isDangun;
      outcomeImage.hidden = isDangun;
      outcomeImage.src = `assets/${SYMBOLS[result.matched ? result.symbols[0] : 2].id}.svg`;
      document.getElementById("outcome-eyebrow").textContent = guaranteed ? "서른 번째 약속, 단군과의 만남" : isDangun ? "하늘의 뜻이 닿아, 새로운 이야기가 열려요" : result.matched ? "신단수 아래, 반가운 만남" : "동굴 앞에서 잠깐 쉬어 가요";
      document.getElementById("outcome-title").textContent = isDangun ? "단군이 나타났어요!" : result.matched ? "성공!" : "아쉽게 실패!";
      document.getElementById("outcome-description").textContent = resultMessage(result);
      outcome.showModal();
      const timer = setTimeout(closeOutcome, isDangun ? 3200 : 1600);
      finishOutcome = () => {
        clearTimeout(timer);
        finishOutcome = null;
        message.textContent = resultMessage(result);
        button.disabled = false;
        button.textContent = "돌리기";
        spinning = false;
        // A second tab may have committed while this tab was presenting its result.
        try { renderPity(readProgress()); }
        catch { storageNote.textContent = "최신 천장 기록을 다시 확인해 주세요."; }
        if (returnFocus) {
          button.focus({ preventScroll: true });
        }
      };
    }

    function animate(now) {
      const elapsed = now - start;
      for (let i = 0; i < 3; i += 1) {
        if (stopped[i]) continue;
        if (elapsed >= stopTimes[i]) {
          showSymbol(i, result.symbols[i]);
          stopped[i] = true;
        } else if (tracks[i] && !reducedMotion.matches) {
          const progress = Math.min(1, elapsed / stopTimes[i]);
          // Cubic ease-out: rolls quickly, then slows down into the exact result.
          const remaining = Math.pow(1 - progress, 3);
          tracks[i].style.transform = `translateY(${-steps[i] * remaining * 100}%)`;
        } else if (tracks[i] && reducedMotion.matches) {
          slots[i].replaceChildren(images[i], labels[i]);
          slots[i].classList.remove("rolling");
          tracks[i] = null;
        }
      }
      if (stopped.every(Boolean)) {
        displayOutcome();
      } else {
        requestAnimationFrame(animate);
      }
    }
    requestAnimationFrame(animate);
  });
})();
