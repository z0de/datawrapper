
define(function() {

    return function($dataPreview, chart, metadata, selectedColumns, messages) {

        function getIndexOfTh(th) {
            var col = $dataPreview.handsontable('getInstance').view.wt.wtTable.getCoords(th)[1];
            return col;
        }

        var dataset;

        var textW = (function() {
            function charW(w, c) {
                if (c == 'W' || c == 'M') w += 15;
                else if (c == 'w' || c == 'm') w += 12;
                else if (c == 'I' || c == 'i' || c == 'l' || c == 't' || c == 'f') w += 4;
                else if (c == 'r') w += 8;
                else if (c == c.toUpperCase()) w += 12;
                else w += 10;
                return w;
            }

            return function(s) {
                return _.reduce(s.split(''), charW, 0);
            };
        })();

        /*
         * updates the Handonstable
         */
        return function(_dataset) {

            dataset = _dataset;

            var data = [],
                horzHeaders = chart.get('metadata.data.horizontal-header'),
                transpose = chart.get('metadata.data.transpose'),
                colW = [],
                tr = buildDataArray(dataset);

            if ($dataPreview.handsontable('getInstance')) {
                $dataPreview.handsontable('loadData', data);
                $dataPreview.handsontable('render');
            } else {
                // initialize Handsontable
                $dataPreview.handsontable({
                    data: data,
                    allowHtml: true,
                    startRows: 6,
                    startCols: 8,
                    width: function() {return $dataPreview.width();},
                    // max-height is 13 rows (400px) otherwise it's the number of rows plus the table header height
                    height: function(){
                        var cell_height = $('#data-preview td').outerHeight(true) + 1;
                        return dataset.numRows() <= 13 ? dataset.numRows() * cell_height + cell_height * 2  : 400;
                    },
                    fixedRowsTop: function(){ return horzHeaders ? 1: 0; },
                    rowHeaders: true,
                    colHeaders: true,
                    colWidths: colW,
                    fillHandle: false,
                    stretchH: 'all',
                    cells: function (row, col, prop) {
                        return {
                            renderer: cellRenderer
                        };
                    },
                    afterRender: function() {
                        renderSelectedTh(); //if HOT was scrolled horizontally, we need to rerender th.selected
                    },
                    afterChange: afterChange
                });

                $('table', $dataPreview).addClass('table table-bordered'); //Bootstrap class names
                $dataPreview.handsontable('render'); //consider Bootstrap class names in auto column size
            }

            if(metadata.changes.exist()) {
                $('#reset-data-changes').removeClass('disabled');
            }
            else {
                $('#reset-data-changes').addClass('disabled');
            }

            if (selectedColumns.length) {
                // update automatic-format checkbox
                if (dataset.column(selectedColumns[0]).type() == 'number') {
                    updateAutomaticFormat();
                }
            }
            // transpose button action
            $('thead tr th:first-child', $dataPreview).off('click').on('click', function(evt) {
                evt.preventDefault();
                chart.set('metadata.data.transpose', !chart.get('metadata.data.transpose', false));
            });

            // context menu
            $('thead tr th+th', $dataPreview).off('click').on('click', function(evt) {
                $(this).contextMenu();
                selectedColumns[0] = getIndexOfTh(this);
                $dataPreview.handsontable('render');
                evt.preventDefault();
            });

            $('thead tr', $dataPreview).contextMenu({
                selector: "th",
                build: function($trigger, evt) {
                    var column = dataset.column($trigger.index()-1),
                        columnFormat = chart.get('metadata.data.column-format', {})[column.name()] || {},
                        items = {
                            h1: { name: messages.columnType+':', disabled: true, className: 'header' },
                            auto: { name: messages.auto },
                            text: { name: messages.text, icon: 'text'},
                            number: { name: messages.number, icon: 'number' },
                            date: { name: messages.date, icon: 'date' },
                            h2: { name: messages.inputFormat+':', disabled: true, className: 'header' },
                            "format/auto": { name: messages.auto }
                        };

                    // select column format
                    if (!columnFormat.type) items.auto.name += ' ('+messages[column.type()]+')  ';
                    items[columnFormat.type || 'auto'].className = 'selected';

                    // fill input formats
                    _.each(column.type(true).ambiguousFormats(), function(fmt) {
                        items['format/' + fmt[0]] = { name: fmt[1] };
                        var k = 'format/' + (columnFormat['input-format'] || 'auto');
                        if (items[k]) items[k].className = 'selected';
                    });

                    return {
                        callback: function(key, options) {
                            var colFormat = $.extend(true, {}, chart.get('metadata.data.column-format', {}));
                            if (!colFormat[column.name()]) colFormat[column.name()] = {};

                            if (key.substr(0,7) == 'format/') {
                                key = key.substr(7);
                                if (key == 'auto') {
                                    delete colFormat[column.name()]['input-format'];
                                } else {
                                    colFormat[column.name()]['input-format'] = key;
                                }
                            } else {
                                // deep-clone object to avoid setting old value
                                if (key == 'auto') {
                                    delete colFormat[column.name()].type;
                                } else {
                                    colFormat[column.name()].type = key;
                                }
                            }
                            // delete key to avoid casting to array during JSON encode
                            if (JSON.stringify(colFormat[column.name()]) == '[]') delete colFormat[column.name()];
                            chart.set('metadata.data.column-format', colFormat);
                        },
                        trigger: 'none',
                        items: items
                    };
                }
            });

            // --- no action below this line ---

            function buildDataArray(ds) {
                var tr = [];
                ds.eachColumn(function(column) {
                    tr.push(column.title());
                    var w = column.type() == 'text' ? _.reduce(column.values(), function(memo, s) { return Math.max(textW(s), memo); }, 0) :
                        column.type() == 'date' ? 120 :
                        Math.max(
                            String(column.range()[1]).length * 12,
                            String(column.range()[0]).length * 12
                        );
                    colW.push(Math.max(80, w));
                });
                data.push(tr);

                ds.eachRow(function(row) {
                    var tr = [];
                    ds.eachColumn(function(column, i) {
                        var val = column.raw(row);
                        tr.push(isNone(val) ? '' : val);
                    });
                    data.push(tr);
                });
            }

            function isNone(val) {
                return val === null || val === undefined || (_.isNumber(val) && isNaN(val));
            }

            function HtmlCellRender(instance, TD, row, col, prop, value, cellProperties) {
              var escaped = dw.utils.purifyHtml(Handsontable.helper.stringify(value));
              TD.innerHTML = escaped; //this is faster than innerHTML. See: https://github.com/warpech/jquery-handsontable/wiki/JavaScript-&-DOM-performance-tips
              if (cellProperties.readOnly) {
                instance.view.wt.wtDom.addClass(TD, 'htDimmed');
              }
              if (cellProperties.valid === false && cellProperties.invalidCellClassName) {
                instance.view.wt.wtDom.addClass(TD, cellProperties.invalidCellClassName);
              }
            }

            function cellRenderer(instance, td, row, col, prop, value, cellProperties) {
                var column = dataset.column(col);
                if (row > 0) {
                    if (column.type() == 'number') {
                        value = Globalize.format(column.val(row - 1));
                    } else {
                        value = chart.columnFormatter(column)(column.val(row - 1), true);
                    }
                }
                HtmlCellRender.apply(this, arguments);
                if (parseInt(value, 10) < 0) { //if row contains negative number
                    td.classList.add('negative');
                }
                td.classList.add(column.type()+'Type');
                if (row === 0) {
                    td.classList.add('firstRow');
                } else {
                    td.classList.add(row % 2 ? 'oddRow' : 'evenRow');
                }
                if (metadata.columnFormat.get(column.name()).ignore) {
                    td.classList.add('ignored');
                }
                if(selectedColumns.indexOf(col) > -1) {
                    td.classList.add('area'); //add blue area background if this cell is in selected column
                }
                if (row > 0 && !column.type(true).isValid(column.val(row-1))) {
                    td.classList.add('parsingError');
                }
            }

            function afterChange(changes, source) {
                if (source !== 'loadData') {
                    changes.forEach(function(change) {
                        if (change[2] != change[3]) {
                            metadata.changes.add(change[0], change[1], change[3]);
                        }
                    });
                }
            }

            function renderSelectedTh() {
                $("thead th.selected", $dataPreview).removeClass('selected');
                selectedColumns.forEach(function(i){
                    getThOfIndex(i).classList.add('selected');
                });
                $("thead th", $dataPreview).each(function(i){
                    if(i > 0) {
                        var index = getIndexOfTh(this);
                        var serie = dataset.column(index).name();
                        if(metadata.columnFormat.get(serie).ignore) {
                            this.classList.add('ignored');
                        }
                        else {
                            this.classList.remove('ignored');
                        }
                    }
                });
            }

            function getThOfIndex(index) {
                var offsetCol = $dataPreview.handsontable('getInstance').view.wt.getSetting('offsetColumn');
                var thIndex = index + 1 * hasCorner() - offsetCol;
                return document.querySelectorAll('#data-preview thead th')[thIndex];
            }

            function hasCorner() {
                return !!$('tbody th', $dataPreview).length;
            }
        }; // end updateTable()
    };
});