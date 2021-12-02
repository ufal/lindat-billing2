jQuery(document).ready(function (){
    var tableIdCnt = 0;
    jQuery('table[type="lb-datatable"]').each(function () {
      var lb_datatable = new LBDataTable(jQuery(this), tableIdCnt++);
      lb_datatable.initialize();
    });
});




function LBDataTable (table, cnt) {
  this.id = 'lb_datatable-'+cnt;
  this.data_url = table.attr("data-url");
  if(table.attr("data-header")) {
    this.data_header = JSON.parse(table.attr("data-header"));
  } else if (table.attr("data-header-field")) {
    this.data_header_field = table.attr("data-header-field")
  }
  this.table = table;
  this.column_settings = table.children('script').text();
  this.data_type = table.attr("data-type");
  if(this.data_type === undefined){ console.log('data_type is not defined, setting default json'); this.data_type = 'json';}
  this.data_field = table.attr("data-field");
  if(this.data_field === undefined){ console.log('data_field is not defined, setting default data'); this.data_field = 'data';}
  if(table.attr("data-items")) {
    this.data_items = JSON.parse(table.attr("data-items"));
  } else if (table.attr("data-header-field")) {
    this.data_items_field = table.attr("data-items-field")
  }
};




LBDataTable.prototype.initialize = function() {
  var self = this;
  self.table.attr('id', self.id);
  jQuery.ajax(
    {
      dataType: 'json',
      type: 'GET',
      url: self.data_url,
      success: function(json){
        var header = jQuery('<thead></thead>');
        var footer = jQuery('<tfoot></tfoot>');
        var headfootrow = jQuery('<tr></tr>');
        if(self.data_header === undefined){
          self.data_header = json[self.data_header_field];
        }
        if(self.data_items === undefined){
          self.data_items = json[self.data_items_field];
        }
        for(let idx in self.data_header) {
           headfootrow.append(jQuery('<th></th>').append(self.data_header[idx]));
        }
        headfootrow.clone().appendTo(header);
        footer.append(headfootrow);
        self.table.append(header);
        self.table.append(footer);
        const array = self.prepareData(json);
        self.table.DataTable( {
            dom: '<"search col s8"f><"download col s4"B>rtip',
            data: array,
            columnDefs: eval(self.column_settings),
            buttons: [
              {
                extend: 'excel',
                title: '',
                filename: 'data',
              },
              {
                extend: 'csv',
                filename: 'data',
              },
            ],
          });
        ['excel', 'csv'].forEach( t => {jQuery("#" + self.id + "_wrapper .buttons-" + t).hide()});

        var downloadDropdown = jQuery('<a class="btn-floating right btn dropdown-trigger"><i class="material-icons">file_download</i></a>')
        jQuery('div.download').append(downloadDropdown);
        dropdownMenu = jQuery('<ul class="dropdown-content"></ul>');
        jQuery('div.download').append(dropdownMenu);
        var dropdownId = 'down-dropdown-' + self.id;
        downloadDropdown.attr('data-target',dropdownId);
        dropdownMenu.attr('id', dropdownId);
        [['csv','csv'], ['xslx','excel']].forEach(type => {
          var downBtn = jQuery('<a>' + type[0] + '</a>');
          dropdownMenu.append(jQuery('<li></li>').append(downBtn));
          downBtn.click( function(e) {
            jQuery("#" + self.id + "_wrapper .buttons-" + type[1]).click();
          });
        });
        M.Dropdown.init(downloadDropdown);
      }
    }
  );
};



LBDataTable.prototype.prepareData = function(data) {
  var self = this;
  if(self.data_type == 'json'){
    return data[self.data_field].map(
                        (row) => {
                          return self.data_items.map(
                            (item_label) => {
                              return item_label ? row[item_label] : ''
                            }
                          )
                        }
                      );
  } else if(self.data_type == 'array') {
    return data[self.data_field];
  }

  console.log('ERROR: unknown data type: ', self.data_type);
  return null;
};