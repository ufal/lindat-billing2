jQuery(document).ready(function () {
    jQuery(".tail").click(function (e) {
        var target = jQuery(e.target);
        var id = target.attr('value');
        var tail = target.is(":checked");
        jQuery.post('/api/tail-file', {id: id, tail: tail}, function (data) {

        });
    });
});