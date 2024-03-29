
const colors = ["#cddc39", "#ff8f00", "#039be5"];
const yAxisPositions = ['left', 'right'];

jQuery(document).ready(function (){
    var chartIdCnt = 0;
    jQuery('div[type="timeline-chart"]').each(function () {
      var chart = new TimelineChart(jQuery(this), chartIdCnt++);
      chart.initialize();
      chart.showData(jQuery(this).attr("data-initview"));
    });
});



function TimelineChart (div, id) {
  // div type="timeline-chart" data-url"..." daata-initview="YYYY-MM-DD"
  this.id = id;
  this.chartCanvas = null;
  this.chartTitle = null;
  this.zoomOutBtn = null;
  this.cached_data_list = {};
  this.cached_data = {};
  this.div = div;
  this.data_url = div.attr("data-url");
  this.data_lines = JSON.parse(div.attr("data-lines"));
  this.metadata = null;
  this.tableT= null;
  this.datatable = null;
  for(let elem in this.data_lines) {
  	this.cached_data[this.data_lines[elem]] = {};
  };
  this.current_view  = null;
  this.period_unit = null;
};



TimelineChart.prototype.initialize = function() {
  var self = this;
  var chartDiv = jQuery('<div class="row"></div>');
  var titleDiv = jQuery('<div class="row"></div>');
  var tableDiv = jQuery('<div class="row"></div>');
  var tableT = jQuery('<table class="striped compact" style="width:100%;"></table>');
  var prevPeriod = jQuery('<div class="col s1 m1 l1"><a class="btn-floating btn-small" title="previous period"><i class="material-icons">navigate_before</i></a></div>');
  var zoomOut    = jQuery('<div class="col s1 m1 l1"><a class="btn-floating btn-small right"><i class="material-icons">keyboard_arrow_up</i></a></div>');
  var tabButtons = jQuery('<div class="col s2 m2 l2"></div>');
  var tabList = jQuery('<ul class="tabs tabs-icon"></ul>')
  tabButtons.append(tabList);
  var downloadDiv    = jQuery('<div class="col s1 m1 l1"></div>');
  var downloadDropdown = jQuery('<a class="btn-floating btn-small right btn dropdown-trigger"><i class="material-icons">file_download</i></a>')
  downloadDiv.append(downloadDropdown);
  var dropdownMenu = jQuery('<ul class="dropdown-content"></ul>');
  downloadDiv.append(dropdownMenu);

  self.chartTitle    = jQuery('<h6 class="col s6 m6 l6"></h6>');
  var nextPeriod = jQuery('<div class="col s1 m1 l1"><a class="btn-floating btn-small right"  title="next period"><i class="material-icons">navigate_next</i></a></div>');
  const chartDivId = 'tlc-' + self.id;
  const tableDivId = 'tlt-' + self.id;
  chartDiv.attr('id', chartDivId);
  tableDiv.attr('id', tableDivId);

  self.chartTitle.attr('id',chartDivId + '-title');
  self.chartCanvas = jQuery('<canvas></canvas>');
  self.chartCanvas.attr('id', chartDivId+'-chart');

  [[chartDivId,'show_chart'], [tableDivId,'border_all']].forEach( (d, i) => {
    var el = jQuery('<li class="tab col s6"></li>');
    var link = jQuery('<a href="#'+d[0]+'"><i class="material-icons">'+d[1]+'</i></a>');
    el.append(link);
    if(i == 0) {
     link.attr('class', 'active');
    }
    tabList.append(el);
  });
  chartDiv.append(self.chartCanvas);
  titleDiv.append(prevPeriod, zoomOut, self.chartTitle, tabButtons, downloadDiv, nextPeriod);
  self.div.append(titleDiv, chartDiv, tableDiv);
  tableDiv.append(tableT);
  self.tableT = tableT;

  prevPeriod.children('a')[0].onclick = function(e){ self.prevPeriod(); }
  self.zoomOutBtn = zoomOut.children('a')[0];
  self.zoomOutButtonEnable();
  nextPeriod.children('a')[0].onclick = function(e){ self.nextPeriod(); }

  var dropdownId = 'down-dropdown-' + self.id;
  downloadDropdown.attr('data-target',dropdownId);
  dropdownMenu.attr('id', dropdownId);
  [['csv','csv'], ['xslx','excel']].forEach(type => {
    var downBtn = jQuery('<a href="#">' + type[0] + '</a>');
    dropdownMenu.append(jQuery('<li></li>').append(downBtn));
    downBtn.click( function(e) {
      jQuery("#" + tableDivId + " .buttons-" + type[1]).click();
    });

  });

  M.Dropdown.init(downloadDropdown);
  M.Tabs.init(tabList);
};

TimelineChart.prototype.showData = function(period) {
  var self = this;
  if(self.current_view == period) return;
  self.clearUI();
  var labels;
  const period_parts = period.split('-');
  self.period_unit = get_period_unit(period_parts);
  self.loadData(period).then(function() {
  	self.current_view = period;
    var dataset = [];
    var scales = {};
    for(let i in self.data_lines) {
      const line = self.data_lines[i];
      var data = self.cached_data[line];
      for(let per in period_parts) {
  	    data = data[period_parts[per]];
      };
      dataset.push({
                label: line,
                data: data["total"],
                backgroundColor: colors[i],
                borderColor: colors[i],
                yAxisID: 'y_'+line
              });
      scales['y_'+line] = {
                  position: yAxisPositions[i%2],
                  ticks: {
                    color: colors[i],
                  }
                };
      labels = data['total'].map(function(elm,idx){return round_format_date(elm['x'],self.period_unit)});
    }

    self.chartTitle.text(format_date(convert_to_date(self.current_view), get_higher_unit(self.period_unit)));
    var ctx = self.chartCanvas[0].getContext('2d');
    var chart = new Chart(ctx, {
        type: 'bar',
        data: {
        	labels: labels,
            datasets: dataset,
        },
        options: {
            interaction: {
              intersect: false,
              mode: 'index',
            },
            scales: {
                ...scales
            },
            plugins: {
            },
            layout: {
                padding: {left: 0, right: 0, top: 0, bottom: 0},
            }
        }
    });
    self.current_view = period;
    self.printDataToTable(dataset, self.period_unit);
    if(get_unit_depth(self.period_unit) < get_unit_depth('hour')) {
      self.chartCanvas[0].onclick = function(e){
        var point = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false }, false);
        if(!point.length) return; // not clicked on point
        var label = chart.data.labels[point[0].index];
        self.zoomIn(self.current_view+'-'+label);
      }
    }
  });

};

//loads data and set them to cache (this.cached_data)
TimelineChart.prototype.loadData = function(period) {
  var self = this;
  var cached = true;
  for(let i in self.data_lines) {
    if(! self.cached_data_list[self.data_lines[i]+period]) cached = false;
  }
  if(cached){
    return Promise.resolve();
  }
  return jQuery.getJSON(self.data_url + "/" + period, function(data) {
    for(let i in self.data_lines) {
      const line = self.data_lines[i];
      self.cached_data_list[line+period] = true;
      var ptr_loaded = data['data'][line];
      var ptr_cache = self.cached_data[line];
      var period_parts = period.split("-");
      for(let j in period_parts) {
      	const per = period_parts[j];
        if(!(per in ptr_loaded)) throw new Error("Loaded data does not match to period ("+period+").");
        if(!(per in ptr_cache)) ptr_cache[per] = {};
        ptr_cache = ptr_cache[per];
        ptr_loaded = ptr_loaded[per];
      };
      ptr_cache['total'] = ptr_loaded['total'].map(function(e){return {x: Date.parse(e['interval']).valueOf() ,y: e['cnt']}});
    };
    self.metadata = data['metadata'];
  });
};

TimelineChart.prototype.nextPeriod = function() {
  this.showData(update_period(this.current_view, this.period_unit, 1));
};

TimelineChart.prototype.prevPeriod = function() {
  this.showData(update_period(this.current_view, this.period_unit, -1));
};

TimelineChart.prototype.zoomOut = function() {
  var self = this;
  var period_parts = self.current_view.split('-');
  period_parts.pop();
  if(period_parts.length <= 1){
    self.zoomOutButtonDisable();
  }
  self.showData(period_parts.join('-'));
};

TimelineChart.prototype.zoomOutButtonDisable = function() {jQuery(this.zoomOutBtn).prop('disabled', true).addClass('disabled').off( "onclick" )};
TimelineChart.prototype.zoomOutButtonEnable = function() {
  var self = this;
  self.zoomOutBtn.onclick = function(e){ self.zoomOut(); };
  jQuery(this.zoomOutBtn).prop('disabled', false).removeClass('disabled');
};

TimelineChart.prototype.zoomIn = function(period) {
  this.zoomOutButtonEnable();
  this.showData(period)
};

TimelineChart.prototype.clearUI = function() {
  var self = this;
  jQuery('#tlc-' + self.id + '-chart').replaceWith('<canvas id="tlc-'+self.id+'-chart"></canvas>');
  self.chartCanvas = jQuery('#tlc-' + self.id + '-chart');
};

TimelineChart.prototype.printDataToTable = function (dataset, period) {
  var self = this;
  var table = self.tableT;

  var row = jQuery('<tr></tr>');
  ('start service_id name period '+self.data_lines.join(' ')).split(' ').forEach(c => row.append(jQuery('<td>' + c + '</td>')));

  table.append(jQuery('<thead></thead>').append(row));
  if ( ! self.datatable ) {
    self.datatable = table.DataTable({
      //"scrollY": "100%",
      //"scrollCollapse": true,
      "searching": false,
      "paging": false,
      dom: 'Bfrtip',
      "buttons": [
          {
            extend: 'excel',
            title: '',
            filename: self.metadata['service_name'], // + moment().format("DD-MMM-YYYY"),
          },
          {
            extend: 'csv',
            filename: self.metadata['service_name'], // + moment().format("DD-MMM-YYYY"),
          },
        ],
    });
    ['excel', 'csv'].forEach( t => {jQuery("#tlt-" + self.id + " .buttons-" + t).hide()});
  }

  self.datatable.clear();

  for(var i = 0; i < dataset[0].data.length; ++i ) {
    self.datatable.row.add( // All data should be converted to string
      [
        print_round_format_date(dataset[0].data[i]['x'],self.period_unit),
        self.metadata['service_id'].toString(),
        self.metadata['service_name'],
        period,
        ...dataset.map(d =>d.data[i]['y'].toString())
      ]
    );
  }
  self.datatable.columns.adjust().draw();
  self.datatable.draw();
};

function get_period_unit(parts) {
  return ['year', 'month','day', 'hour'][parts.length];
}

function get_unit_depth(unit) {
  return {'year': 0, 'month': 1,'day': 3, 'hour': 4}[unit];
}

function get_higher_unit(unit) {
  return {month: 'year', day: 'month', hour: 'day'}[unit];
}

function round_format_date(date, unit) {
  return moment(date).format({year: 'YYYY', month: 'MM', day: 'DD', hour: 'HH'}[unit]);
}

function print_round_format_date(date, unit) {
  return moment(date).format({year: 'YYYY', month: 'YYYY-MM', day: 'YYYY-MM-DD', hour: 'YYYY-MM-DDTHH'}[unit]);
}

function update_period(date, unit, correction) {
  unit = get_higher_unit(unit);
  return moment(date).add(correction, unit).format({year: 'YYYY', month: 'YYYY-MM', day: 'YYYY-MM-DD', hour: 'YYYY-MM-DD'}[unit]);
}

function format_date(date, unit) {
  return moment(date).format({'':'', year: 'YYYY', month: 'MMMM YYYY', day: 'MMMM Do YYYY'}[unit]);
}

function convert_to_date(period){
  period += '-01-01';
  return moment(period.split('-').slice(0,3).join('-'))
}

