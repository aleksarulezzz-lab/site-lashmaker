(function(){
  var WORKER_BASE_URL = 'http://127.0.0.1:8787'; // updated to the real deployed Worker URL in a later task

  var FIXED_SLOTS = ['10:00','13:00','16:00'];
  var WEEKDAY_LABELS = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

  function isWorkingDay(dateStr){
    var day = new Date(dateStr + 'T00:00:00Z').getUTCDay();
    return day >= 1 && day <= 5;
  }
  function addDays(dateStr, n){
    var d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0,10);
  }
  function formatDateLabel(dateStr){
    var d = new Date(dateStr + 'T00:00:00Z');
    var day = String(d.getUTCDate()).padStart(2,'0');
    var month = String(d.getUTCMonth()+1).padStart(2,'0');
    return WEEKDAY_LABELS[d.getUTCDay()] + ' ' + day + '.' + month;
  }
  function todayMoscow(){
    return new Date(Date.now() + 3*3600*1000).toISOString().slice(0,10);
  }
  function nextWorkingDays(fromDateStr, count){
    var result = [];
    var cursor = fromDateStr;
    while(result.length < count){
      if(isWorkingDay(cursor)) result.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return result;
  }

  var state = {
    pageStart: todayMoscow(),
    days: [],
    availability: {},
    selectedDate: null,
    selectedTime: null
  };

  var daysEl = document.getElementById('bookingDays');
  var timesEl = document.getElementById('bookingTimes');
  var labelEl = document.getElementById('bookingSlotsLabel');
  var prevBtn = document.getElementById('bookingPrevWeek');
  var nextBtn = document.getElementById('bookingNextWeek');
  var dateHiddenInput = document.getElementById('date');
  var slotHiddenInput = document.getElementById('slotTime');
  var form = document.getElementById('bookingForm');
  var submitBtn = document.getElementById('bookingSubmitBtn');
  var msgEl = document.getElementById('formMsg');

  function setSubmitEnabled(){
    submitBtn.disabled = !(state.selectedDate && state.selectedTime);
  }

  function fetchAvailability(from, to){
    return fetch(WORKER_BASE_URL + '/api/availability?from=' + from + '&to=' + to)
      .then(function(res){
        if(!res.ok) throw new Error('availability_failed');
        return res.json();
      })
      .then(function(data){
        data.days.forEach(function(d){ state.availability[d.date] = d.slots; });
      });
  }

  function renderDays(){
    daysEl.innerHTML = '';
    state.days.forEach(function(date){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'booking-day-btn' + (date === state.selectedDate ? ' is-selected' : '');
      btn.textContent = formatDateLabel(date);
      btn.addEventListener('click', function(){ selectDate(date); });
      daysEl.appendChild(btn);
    });
  }

  function renderTimes(){
    timesEl.innerHTML = '';
    if(!state.selectedDate){ return; }
    var slots = state.availability[state.selectedDate] || [];
    slots.forEach(function(s){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'booking-time-btn' + (s.free ? '' : ' is-booked') + (s.time === state.selectedTime ? ' is-selected' : '');
      btn.textContent = s.free ? s.time : (s.time + ' — занято');
      btn.disabled = !s.free;
      if(s.free){
        btn.addEventListener('click', function(){ selectTime(s.time); });
      }
      timesEl.appendChild(btn);
    });
  }

  function selectDate(date){
    state.selectedDate = date;
    state.selectedTime = null;
    dateHiddenInput.value = date;
    slotHiddenInput.value = '';
    labelEl.textContent = formatDateLabel(date);
    renderDays();
    renderTimes();
    setSubmitEnabled();
  }

  function selectTime(time){
    state.selectedTime = time;
    slotHiddenInput.value = time;
    renderTimes();
    setSubmitEnabled();
  }

  function loadPage(){
    state.days = nextWorkingDays(state.pageStart, 7);
    var from = state.days[0];
    var to = state.days[state.days.length - 1];
    fetchAvailability(from, to).then(function(){
      renderDays();
      renderTimes();
    }).catch(function(){
      daysEl.innerHTML = '';
      timesEl.innerHTML = '<p class="booking-error">Не удалось загрузить расписание. Обновите страницу.</p>';
    });
  }

  prevBtn.addEventListener('click', function(){
    state.pageStart = addDays(state.days[0], -7);
    loadPage();
  });
  nextBtn.addEventListener('click', function(){
    state.pageStart = addDays(state.days[state.days.length - 1], 1);
    loadPage();
  });

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var name = form.name.value.trim();
    var phone = form.phone.value.trim();
    var service = form.service.value;
    var phoneRe = /^[\d\s\+\-\(\)]{10,18}$/;
    if(name.length < 2){ msgEl.textContent = 'Пожалуйста, укажите имя.'; msgEl.className = 'form-msg is-error'; return; }
    if(!phoneRe.test(phone)){ msgEl.textContent = 'Проверьте номер телефона.'; msgEl.className = 'form-msg is-error'; return; }
    if(!service){ msgEl.textContent = 'Выберите услугу.'; msgEl.className = 'form-msg is-error'; return; }
    if(!state.selectedDate || !state.selectedTime){ msgEl.textContent = 'Выберите дату и время записи.'; msgEl.className = 'form-msg is-error'; return; }
    submitBtn.disabled = true;
    fetch(WORKER_BASE_URL + '/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: state.selectedDate,
        slot_time: state.selectedTime,
        client_name: name,
        client_phone: phone,
        service: service
      })
    }).then(function(res){
      if(res.status === 409){ throw new Error('slot_taken'); }
      if(!res.ok){ throw new Error('failed'); }
      return res.json();
    }).then(function(){
      msgEl.textContent = 'Спасибо, ' + name + '! Заявка отправлена — я свяжусь с вами для подтверждения записи.';
      msgEl.className = 'form-msg is-success';
      form.reset();
      state.selectedDate = null;
      state.selectedTime = null;
      state.availability = {};
      loadPage();
    }).catch(function(err){
      if(err.message === 'slot_taken'){
        msgEl.textContent = 'Этот слот только что заняли. Пожалуйста, выберите другое время.';
        loadPage();
      } else {
        msgEl.textContent = 'Не получилось отправить заявку. Проверьте связь с интернетом и попробуйте ещё раз.';
      }
      msgEl.className = 'form-msg is-error';
      setSubmitEnabled();
    });
  });

  loadPage();
})();
