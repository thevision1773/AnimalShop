/*
 * HTML5 Sortable jQuery Plugin
 * https://github.com/voidberg/html5sortable
 *
 * Original code copyright 2012 Ali Farhadi.
 * This version is mantained by Alexandru Badiu <andu@ctrlz.ro>
 *
 * Thanks to the following contributors: andyburke, bistoco, daemianmack, drskullster, flying-sheep, OscarGodson, Parikshit N. Samant, rodolfospalenza, ssafejava
 *
 * Released under the MIT license.
 */
"use strict";!function(t){var e,a,r=t();t.fn.sortable=function(i){var n=String(i);return i=t.extend({connectWith:!1,placeholder:null,dragImage:null},i),this.each(function(){if("reload"===n&&t(this).children(i.items).off("dragstart.h5s dragend.h5s selectstart.h5s dragover.h5s dragenter.h5s drop.h5s"),/^enable|disable|destroy$/.test(n)){var s=t(this).children(t(this).data("items")).attr("draggable","enable"===n);return void("destroy"===n&&(t(this).off("sortupdate"),t(this).removeData("opts"),s.add(this).removeData("connectWith items").off("dragstart.h5s dragend.h5s selectstart.h5s dragover.h5s dragenter.h5s drop.h5s").off("sortupdate")))}var d=t(this).data("opts");"undefined"==typeof d?t(this).data("opts",i):i=d;var o,h,l,g,c=t(this).children(i.items),f=null===i.placeholder?t("<"+(/^ul|ol$/i.test(this.tagName)?"li":"div")+' class="sortable-placeholder"/>'):t(i.placeholder).addClass("sortable-placeholder");c.find(i.handle).mousedown(function(){o=!0}).mouseup(function(){o=!1}),t(this).data("items",i.items),r=r.add(f),i.connectWith&&t(i.connectWith).add(this).data("connectWith",i.connectWith),c.attr("role","option"),c.attr("aria-grabbed","false"),c.attr("draggable","true").on("dragstart.h5s",function(r){if(r.stopImmediatePropagation(),i.handle&&!o)return!1;o=!1;var n=r.originalEvent.dataTransfer;n.effectAllowed="move",n.setData("text",""),i.dragImage&&n.setDragImage&&n.setDragImage(i.dragImage,0,0),h=(e=t(this)).addClass("sortable-dragging").attr("aria-grabbed","true").index(),a=e.outerHeight(),l=t(this).parent()}).on("dragend.h5s",function(){e&&(e.removeClass("sortable-dragging").attr("aria-grabbed","false").show(),r.detach(),g=t(this).parent(),(h!==e.index()||l.get(0)!==g.get(0))&&e.parent().triggerHandler("sortupdate",{item:e,oldindex:h,startparent:l,endparent:g}),e=null,a=null)}).not("a[href], img").on("selectstart.h5s",function(){return i.handle&&!o?!0:(this.dragDrop&&this.dragDrop(),!1)}).end().add([this,f]).on("dragover.h5s dragenter.h5s drop.h5s",function(n){if(!c.is(e)&&i.connectWith!==t(e).parent().data("connectWith"))return!0;if("drop"===n.type)return n.stopPropagation(),r.filter(":visible").after(e),e.trigger("dragend.h5s"),!1;if(n.preventDefault(),n.originalEvent.dataTransfer.dropEffect="move",c.is(this)){var s=t(this).outerHeight();if(i.forcePlaceholderSize&&f.height(a),s>a){var d=s-a,o=t(this).offset().top;if(f.index()<t(this).index()&&n.originalEvent.pageY<o+d)return!1;if(f.index()>t(this).index()&&n.originalEvent.pageY>o+s-d)return!1}e.hide(),t(this)[f.index()<t(this).index()?"after":"before"](f),r.not(f).detach()}else r.is(this)||t(this).children(i.items).length||(r.detach(),t(this).append(f));return!1})})}}(jQuery);



    /*=== Sortable ===*/
    $('.sortable').sortable();
    $('.handles').sortable({
        handle: 'span'
    });
    $('.connected').sortable({
        connectWith: '.connected'
    });
    $('.exclude').sortable({
        items: ':not(.disabled)'
    });