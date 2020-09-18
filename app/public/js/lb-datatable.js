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
  this.data_header = JSON.parse(table.attr("data-header"));
  this.table = table;
  this.column_settings = table.children('script').text();
};



LBDataTable.prototype.initialize = function() {
  var self = this;
  self.table.attr('id', self.id);
  var header = jQuery('<thead></thead>');
  var footer = jQuery('<tfoot></tfoot>');
  var headfootrow = jQuery('<tr></tr>');
  for(let idx in self.data_header) {
  	headfootrow.append(jQuery('<th></th>').append(self.data_header[idx]));
  }
  headfootrow.clone().appendTo(header);
  footer.append(headfootrow);
  self.table.append(header);
  self.table.append(footer);

  self.table.DataTable( {
        "ajax": self.data_url,
        "columnDefs": eval(self.column_settings)
    } );

};


