jQuery(document).ready(function (){
    var selectIdCnt = 0;
    jQuery('select[type="lb-select"]').each(function () {
      var lb_select = new LBSelect(jQuery(this), selectIdCnt++);
      lb_select.initialize();
    });
});



function LBSelect (select, cnt) {
  this.id = 'lb_select-'+cnt;
  this.data_url = select.attr("data-url");
  this.data_key = select.attr("data-key");
  this.data_value = JSON.parse(select.attr("data-value"));
  this.data_template = select.attr("data-select-template");
  this.data_field = select.attr("data-field") || 'data';
  this.data_selected = select.attr("data-selected");
  this.select = select;
};





LBSelect.prototype.initialize = function() {
  var self = this;
  self.loadData().then(function() {
    var seen;
    self.data[self.data_field].forEach(item => {
        var new_option = document.createElement("option");
        if(self.data_selected == item[self.data_key]){
          new_option.selected = 'selected';
          seen = self.data_selected;
        }
        new_option.value = item[self.data_key];
        new_option.innerHTML = self.data_value.reduce((p,f) => p.replace(/%s/,item[f]), self.data_template);
        self.select.append(new_option);
    });
    if(seen === undefined){
      self.select.append(jQuery('<option value="" selected disabled hidden>---</option>'));
    }
    M.FormSelect.init(self.select);
  });

};


LBSelect.prototype.loadData = function() {
  var self = this;
  return jQuery.getJSON(self.data_url, function(data) {
    self.data = data;
  });
};