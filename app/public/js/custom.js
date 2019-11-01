jQuery(document).ready(function () {
    jQuery(".tail").click(function (e) {
        var target = jQuery(e.target);
        var id = target.attr('value');
        var tail = target.is(":checked");
        jQuery.post('/api/tail-file', {id: id, tail: tail}, function (data) {

        });
    });
});


function showServiceCountsSeries(elementId, data, unqdata, labels, color){
    var canvas = document.getElementById(elementId);
    var ctx = canvas.getContext('2d');
    console.log(data,labels);
    var chart = new Chart(ctx, {
        type: 'bar',
        data: {
        	labels: labels,
            datasets: [{
                data: data,
                backgroundColor: color,
                borderColor: color,
                type: 'line',
                pointRadius: 4,
                fill: false,
                lineTension: 0,
                borderWidth: 3
              },{
                data: unqdata,
                backgroundColor: color,
                borderColor: color,
                type: 'line',
                pointRadius: 4,
                pointStyle: 'rect',
                fill: false,
                lineTension: 0,
                borderWidth: 3
            }],
        },
        options: {
            showLine: false,
            legend: {
                display: false
            },
            point:{
                borderWidth: 1,
                
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
    canvas.onclick = function(e){
        console.log("CLICK",e);
        var point = chart.getElementAtEvent(e);
        console.log("CLICK",point,point.length);
        if(!point.length) return; // not clicked on point
        var label = chart.data.labels[point[0]._index];
        console.log("LABEL: ", label);
        window.open('/chart/'+label);
    }
}