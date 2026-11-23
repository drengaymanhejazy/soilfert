(() => {
  'use strict';

  const DATA = window.SOILFERT_DATA;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const els = {
    form: $('#analysisForm'), cropSelect: $('#cropSelect'), unitSelect: $('#unitSelect'), treeOptions: $('#treeOptions'),
    irrigationSelect: $('#irrigationSelect'), ageSelect: $('#ageSelect'), densityInput: $('#densityInput'),
    nitrogenInput: $('#nitrogenInput'), phosphorusInput: $('#phosphorusInput'), potassiumInput: $('#potassiumInput'), organicInput: $('#organicInput'),
    formError: $('#formError'), resetButton: $('#resetButton'), emptyResult: $('#emptyResult'), report: $('#report'), resultActions: $('#resultActions'),
    reportCropName: $('#reportCropName'), reportMeta: $('#reportMeta'), reportDate: $('#reportDate'), diagnosisGrid: $('#diagnosisGrid'),
    needsTable: $('#needsTable'), fertilizerGrid: $('#fertilizerGrid'), adviceList: $('#adviceList'), scientificNote: $('#scientificNote'),
    shareButton: $('#shareButton'), printButton: $('#printButton'), copyButton: $('#copyButton'), selectionHelper: $('#selectionHelper')
  };
  let latestReport = '';

  const labels = { nitrogen: 'النيتروجين N', phosphorus: 'الفوسفور P₂O₅', potassium: 'البوتاسيوم K₂O', organic: 'المادة العضوية OM' };
  const elementKeys = ['nitrogen', 'phosphorus', 'potassium'];
  const inputMap = { nitrogen: els.nitrogenInput, phosphorus: els.phosphorusInput, potassium: els.potassiumInput, organic: els.organicInput };

  function populateSelect(category = 'crop') {
    const list = category === 'tree' ? DATA.trees : DATA.crops;
    els.cropSelect.innerHTML = list.map((item, index) => `<option value="${index}">${escapeHtml(item.name)}</option>`).join('');
    els.selectionHelper.textContent = category === 'tree' ? 'تُطبّق عوامل الري والعمر بعد حساب الأساس من تحليل التربة.' : 'القيم المعروضة مأخوذة من قاعدة البيانات الأولية.';
  }

  function currentCategory() { return $('input[name="category"]:checked')?.value || 'crop'; }
  function currentList() { return currentCategory() === 'tree' ? DATA.trees : DATA.crops; }
  function getSelectedItem() { return currentList()[Number(els.cropSelect.value)] || currentList()[0]; }

  function setCategory(category) {
    $$('[data-category-label]').forEach((label) => label.classList.toggle('active', label.querySelector('input').value === category));
    els.treeOptions.hidden = category !== 'tree';
    populateSelect(category);
  }

  function classify(value, type, category) {
    const levels = type === 'organic' ? DATA.levels.organic : (category === 'tree' ? DATA.levels.tree[type] : DATA.levels.crop[type]);
    let index;
    if (type === 'nitrogen') index = value < 5 ? 0 : value <= 9 ? 1 : value <= 15 ? 2 : value <= 19 ? 3 : 4;
    if (type === 'phosphorus') {
      if (category === 'tree') index = value < 3 ? 0 : value <= 6 ? 1 : value <= 9 ? 2 : value <= 12 ? 3 : value <= 15 ? 4 : value <= 18 ? 5 : 6;
      else index = value < 3 ? 0 : value <= 5 ? 1 : value <= 7 ? 2 : value <= 9 ? 3 : value <= 12 ? 4 : 5;
    }
    if (type === 'potassium') {
      if (category === 'tree') index = value < 60 ? 0 : value <= 120 ? 1 : value <= 180 ? 2 : value <= 240 ? 3 : value <= 300 ? 4 : value <= 360 ? 5 : value <= 420 ? 6 : 7;
      else index = value < 60 ? 0 : value <= 120 ? 1 : value <= 160 ? 2 : value <= 240 ? 3 : value <= 250 ? 4 : value <= 260 ? 5 : value <= 420 ? 6 : 7;
    }
    if (type === 'organic') index = value < 1 ? 0 : value <= 2 ? 1 : value <= 3 ? 2 : 3;
    return { index, ...levels[index] };
  }

  function organicFactor(value) { return value < 1 ? 1.2 : value <= 2 ? 1 : value <= 3 ? 0.9 : 0.7; }
  function statusClass(label) {
    if (label.includes('منخفض')) return 'low';
    if (label.includes('متوسط')) return 'medium';
    if (label.includes('جيد')) return 'good';
    return 'high';
  }
  function formatNumber(value) { return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(value); }
  function formatDecimal(value) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value); }
  function unitInfo() { return els.unitSelect.value === 'hectare' ? { label: 'كغ / هكتار', divisor: 1 } : { label: 'كغ / دونم', divisor: 10 }; }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

  function readInputs() {
    const values = {};
    for (const [key, input] of Object.entries(inputMap)) values[key] = Number(input.value);
    const density = els.densityInput.value.trim() === '' ? null : Number(els.densityInput.value);
    if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0)) throw new Error('أدخل قيمًا صحيحة غير سالبة لجميع عناصر التحليل.');
    if (values.organic > 100) throw new Error('نسبة المادة العضوية يجب ألا تتجاوز 100%.');
    if (density !== null && (!Number.isFinite(density) || density <= 0)) throw new Error('كثافة الأشجار الاختيارية يجب أن تكون أكبر من صفر.');
    return { ...values, density };
  }

  function calculate(values) {
    const category = currentCategory();
    const item = getSelectedItem();
    const unit = unitInfo();
    const diagnosis = {
      nitrogen: classify(values.nitrogen, 'nitrogen', category), phosphorus: classify(values.phosphorus, 'phosphorus', category),
      potassium: classify(values.potassium, 'potassium', category), organic: classify(values.organic, 'organic', category)
    };
    const indexes = { nitrogen: diagnosis.nitrogen.index, phosphorus: diagnosis.phosphorus.index, potassium: diagnosis.potassium.index };
    const base = { nitrogen: item.n[indexes.nitrogen] || 0, phosphorus: item.p[indexes.phosphorus] || 0, potassium: item.k[indexes.potassium] || 0 };
    const omAdjustment = organicFactor(values.organic);
    const treeFactor = category === 'tree' ? DATA.irrigationFactors[els.irrigationSelect.value] * DATA.ageFactors[els.ageSelect.value] : 1;
    const adjusted = { nitrogen: base.nitrogen * omAdjustment * treeFactor / unit.divisor, phosphorus: base.phosphorus * treeFactor / unit.divisor, potassium: base.potassium * treeFactor / unit.divisor };
    const fertilizer = {
      urea: adjusted.nitrogen / DATA.fertilizerRates.urea.factor,
      superPhosphate: adjusted.phosphorus / DATA.fertilizerRates.superPhosphate.factor,
      potassiumSulfate: adjusted.potassium / DATA.fertilizerRates.potassiumSulfate.factor
    };
    return { category, item, unit, values, diagnosis, indexes, base, adjusted, fertilizer, treeFactor, omAdjustment };
  }

  function render(result) {
    const { category, item, unit, values, diagnosis, adjusted, fertilizer, base, treeFactor, omAdjustment } = result;
    const kind = category === 'tree' ? `${DATA.irrigationLabels[els.irrigationSelect.value]} · ${DATA.ageLabels[els.ageSelect.value]}` : 'محصول حقلي';
    els.reportCropName.textContent = item.name;
    els.reportMeta.textContent = `${kind} · التوصية بوحدة ${unit.label}`;
    els.reportDate.textContent = new Intl.DateTimeFormat('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
    els.diagnosisGrid.innerHTML = [...elementKeys, 'organic'].map((key) => {
      const d = diagnosis[key];
      return `<div class="diagnosis-item ${statusClass(d.label)}"><span class="diag-label"><span>${labels[key]}</span><span>${formatDecimal(values[key])}</span></span><strong class="diag-level">${d.label}</strong><span class="diag-value">${d.range}</span></div>`;
    }).join('');
    const rows = [
      ['N', 'النيتروجين', adjusted.nitrogen, base.nitrogen, diagnosis.nitrogen],
      ['P₂O₅', 'الفوسفور', adjusted.phosphorus, base.phosphorus, diagnosis.phosphorus],
      ['K₂O', 'البوتاسيوم', adjusted.potassium, base.potassium, diagnosis.potassium]
    ];
    els.needsTable.innerHTML = `<div class="rec-row head"><span>العنصر</span><span>مستوى التحليل</span><span class="amount">الاحتياج</span></div>` + rows.map(([symbol, name, amount, original, diagnosisItem]) => `<div class="rec-row"><strong>${symbol} — ${name}</strong><span class="note">${diagnosisItem.label} · أساس الجدول ${formatNumber(original)} كغ/هـ</span><span class="amount">${formatDecimal(amount)} ${unit.label}</span></div>`).join('');
    const fertilizerCards = [
      ['urea', 'يوريا', '46% N', fertilizer.urea], ['superPhosphate', 'سوبر فوسفات', '18% P₂O₅', fertilizer.superPhosphate], ['potassiumSulfate', 'سلفات بوتاسيوم', '50% K₂O', fertilizer.potassiumSulfate]
    ];
    els.fertilizerGrid.innerHTML = fertilizerCards.map(([key, name, formula, amount]) => `<div class="fert-card"><span class="fert-accent"></span><div><strong>${name}</strong><small>${formula}</small></div><b>${formatDecimal(amount)} <small>${unit.label}</small></b></div>`).join('');
    els.adviceList.innerHTML = buildAdvice(result).map((advice) => `<div class="advice-item">${advice}</div>`).join('');
    const treeNotice = category === 'tree' ? ` معامل الأشجار المطبق بعد الأساس = ${formatDecimal(treeFactor)} (${DATA.irrigationLabels[els.irrigationSelect.value]} × ${DATA.ageLabels[els.ageSelect.value]}).` : '';
    const omNotice = ` معامل المادة العضوية المطبق على النيتروجين = ${formatDecimal(omAdjustment)} وفق تصنيف ${diagnosis.organic.label}.`;
    els.scientificNote.textContent = `هذه نتيجة إرشادية تعتمد على قيم تحليل التربة المدخلة وجدول ${category === 'tree' ? 'الأشجار' : 'المحصول'}.${omNotice}${treeNotice} راجع مصدر الجدول والمهندس الزراعي قبل التنفيذ.`;
    els.emptyResult.hidden = true; els.report.hidden = false; els.resultActions.hidden = false;
    latestReport = buildPlainText(result);
  }

  function buildAdvice(result) {
    const { diagnosis, category, values } = result;
    const advice = [];
    const adviceFor = { nitrogen: 'النيتروجين', phosphorus: 'الفوسفور', potassium: 'البوتاسيوم' };
    for (const key of elementKeys) {
      const label = diagnosis[key].label;
      if (label.includes('منخفض')) advice.push(`${adviceFor[key]} منخفض؛ وزّع الإضافة على دفعات مناسبة للمحصول بدل إعطائها دفعة واحدة.`);
      else if (label.includes('مرتفع') || label.includes('عالي') || label.includes('ممتاز')) advice.push(`${adviceFor[key]} ${label}؛ لا تضف كميات إضافية من هذا العنصر إلا وفق توصية موثقة.`);
      else advice.push(`${adviceFor[key]} في مستوى ${label}؛ التزم بالكمية المحسوبة في الجدول.`);
    }
    if (diagnosis.organic.label === 'منخفض') advice.push('المادة العضوية منخفضة؛ ناقش إضافة مادة عضوية متخمرة وتحسين إدارة التربة مع المختص.');
    if (diagnosis.organic.label === 'عالية جدًا') advice.push('المادة العضوية عالية جدًا؛ راجع مصدرها ونتيجة التحليل قبل إضافة أي مادة عضوية جديدة.');
    if (category === 'tree' && values.density) advice.push(`مع كثافة ${formatDecimal(values.density)} شجرة/الوحدة، اقسم كمية الوحدة على الكثافة للحصول على كمية تقريبية للشجرة.`);
    advice.push('التوصية لا تغني عن التحقق من طريقة الاستخلاص في المختبر ونوع السماد المتوفر فعليًا.');
    return advice;
  }

  function buildPlainText(result) {
    const { item, unit, diagnosis, adjusted, fertilizer, category } = result;
    const lines = [`تقرير التوصية السمادية — ${item.name}`, `الوحدة: ${unit.label}`, '', 'تشخيص التربة:'];
    [...elementKeys, 'organic'].forEach((key) => lines.push(`- ${labels[key]}: ${diagnosis[key].label} (${formatDecimal(result.values[key])})`));
    lines.push('', 'الاحتياج السمادي:');
    lines.push(`- N: ${formatDecimal(adjusted.nitrogen)} ${unit.label}`, `- P₂O₅: ${formatDecimal(adjusted.phosphorus)} ${unit.label}`, `- K₂O: ${formatDecimal(adjusted.potassium)} ${unit.label}`, '', 'الأسمدة التجارية:');
    lines.push(`- يوريا 46%: ${formatDecimal(fertilizer.urea)} ${unit.label}`, `- سوبر فوسفات 18%: ${formatDecimal(fertilizer.superPhosphate)} ${unit.label}`, `- سلفات بوتاسيوم 50%: ${formatDecimal(fertilizer.potassiumSulfate)} ${unit.label}`);
    lines.push('', 'تنبيه: نتيجة إرشادية تعتمد على بيانات التحليل والجداول الحالية، ويجب مراجعتها مع مهندس زراعي.');
    return lines.join('\n');
  }

  async function shareReport() {
    if (!latestReport) return;
    try {
      if (navigator.share) await navigator.share({ title: 'تقرير التوصية السمادية', text: latestReport });
      else { await navigator.clipboard.writeText(latestReport); showToast('تم نسخ التقرير للمشاركة.'); }
    } catch (error) { if (error.name !== 'AbortError') showToast('تعذر المشاركة، استخدم زر النسخ.'); }
  }
  async function copyReport() { try { await navigator.clipboard.writeText(latestReport); showToast('تم نسخ نص التقرير.'); } catch { showToast('تعذر النسخ تلقائيًا؛ حدّد النص يدويًا.'); } }
  function showToast(message) { const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message; document.body.appendChild(toast); setTimeout(() => toast.remove(), 2400); }
  function resetForm() { els.form.reset(); document.querySelector('input[name="category"][value="crop"]').checked = true; setCategory('crop'); els.emptyResult.hidden = false; els.report.hidden = true; els.resultActions.hidden = true; els.formError.hidden = true; latestReport = ''; }

  $$('input[name="category"]').forEach((input) => input.addEventListener('change', () => setCategory(input.value)));
  els.form.addEventListener('submit', (event) => { event.preventDefault(); els.formError.hidden = true; try { render(calculate(readInputs())); } catch (error) { els.formError.textContent = error.message; els.formError.hidden = false; } });
  els.resetButton.addEventListener('click', resetForm); els.shareButton.addEventListener('click', shareReport); els.printButton.addEventListener('click', () => window.print()); els.copyButton.addEventListener('click', copyReport);
  populateSelect('crop');
})();
