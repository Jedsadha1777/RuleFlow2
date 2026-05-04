(function () {
  function partsFromIso(type, val) {
    var v = typeof val === 'string' ? val : '';
    var out = { date: '', hour: '', minute: '', second: '' };
    if (type === 'date') {
      out.date = v.length === 10 ? v : '';
    }
    if (type === 'time') {
      out.hour = v.slice(0, 2);
      out.minute = v.slice(3, 5);
      out.second = v.slice(6, 8);
    }
    if (type === 'datetime') {
      out.date = v.length >= 10 ? v.slice(0, 10) : '';
      out.hour = v.slice(11, 13);
      out.minute = v.slice(14, 16);
      out.second = v.slice(17, 19);
    }
    return out;
  }

  function isoFromParts(type, p) {
    if (type === 'date') {
      return p.date || '';
    }
    if (type === 'time') {
      if (!p.hour || !p.minute) return '';
      return p.hour + ':' + p.minute + ':' + (p.second || '00');
    }
    if (type === 'datetime') {
      if (!p.date || !p.hour || !p.minute) return '';
      var tz = p.tz || 'Z';
      return p.date + 'T' + p.hour + ':' + p.minute + ':' + (p.second || '00') + tz;
    }
    return '';
  }

  function browserTzOffset(d) {
    var date = d || new Date();
    var m = -date.getTimezoneOffset();
    if (m === 0) return 'Z';
    var sign = m >= 0 ? '+' : '-';
    var abs = Math.abs(m);
    var hh = String(Math.floor(abs / 60)).padStart(2, '0');
    var mm = String(abs % 60).padStart(2, '0');
    return sign + hh + ':' + mm;
  }

  if (typeof window !== 'undefined') {
    window.partsFromIso = partsFromIso;
    window.isoFromParts = isoFromParts;
    window.browserTzOffset = browserTzOffset;
  }
})();
