jQuery(document).ready(function () {
    jQuery(".tail").click(function (e) {
        var target = jQuery(e.target);
        var id = target.attr('value');
        var tail = target.is(":checked");
        jQuery.post('/api/tail-file', {id: id, tail: tail}, function (data) {

        });
    });
});


function showServiceCountsSeries(elementId, data, color){
    ctx = document.getElementById(elementId).getContext('2d');
    console.log(data);
    chart = new Chart(ctx, {
        type: 'bar',
        data: {
            datasets: [{
                data: data,
                backgroundColor: color,
                type: 'line',
                pointRadius: 0,
                fill: false,
                lineTension: 0,
                borderWidth: 2
            }],
        },
        options: {
            showLine: false,
            legend: {
                display: false
            },
            scales: {
                xAxes: [{
                    type: 'time',
                    distribution: 'series',
                    ticks: {
                        source: 'data',
                        //autoSkip: true
                    },
                    time: {
                        unit: 'day',
                        unitStepSize: 1
                    }
                }],
                yAxes: [{
                    scaleLabel: {
                    	display: true
                    }
                }]
            },
            layout: {
                padding: {left: 0, right: 0, top: 0, bottom: 0},
            } 
        }
    });
}