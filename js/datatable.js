/*!
 * mustache.js - Logic-less {{mustache}} templates with JavaScript
 * http://github.com/janl/mustache.js
 */

/*global define: false*/

(function (root, factory) {
  if (typeof exports === "object" && exports) {
    module.exports = factory; // CommonJS
  } else if (typeof define === "function" && define.amd) {
    define(factory); // AMD
  } else {
    root.Mustache = factory; // <script>
  }
}(this, (function () {

  var exports = {};

  exports.name = "mustache.js";
  exports.version = "0.7.2";
  exports.tags = ["{{", "}}"];

  exports.Scanner = Scanner;
  exports.Context = Context;
  exports.Writer = Writer;

  var whiteRe = /\s*/;
  var spaceRe = /\s+/;
  var nonSpaceRe = /\S/;
  var eqRe = /\s*=/;
  var curlyRe = /\s*\}/;
  var tagRe = /#|\^|\/|>|\{|&|=|!/;

  // Workaround for https://issues.apache.org/jira/browse/COUCHDB-577
  // See https://github.com/janl/mustache.js/issues/189
  function testRe(re, string) {
    return RegExp.prototype.test.call(re, string);
  }

  function isWhitespace(string) {
    return !testRe(nonSpaceRe, string);
  }

  var isArray = Array.isArray || function (obj) {
    return Object.prototype.toString.call(obj) === "[object Array]";
  };

  function escapeRe(string) {
    return string.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
  }

  var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;'
  };

  function escapeHtml(string) {
    return String(string).replace(/[&<>"'\/]/g, function (s) {
      return entityMap[s];
    });
  }

  // Export the escaping function so that the user may override it.
  // See https://github.com/janl/mustache.js/issues/244
  exports.escape = escapeHtml;

  function Scanner(string) {
    this.string = string;
    this.tail = string;
    this.pos = 0;
  }

  /**
   * Returns `true` if the tail is empty (end of string).
   */
  Scanner.prototype.eos = function () {
    return this.tail === "";
  };

  /**
   * Tries to match the given regular expression at the current position.
   * Returns the matched text if it can match, the empty string otherwise.
   */
  Scanner.prototype.scan = function (re) {
    var match = this.tail.match(re);

    if (match && match.index === 0) {
      this.tail = this.tail.substring(match[0].length);
      this.pos += match[0].length;
      return match[0];
    }

    return "";
  };

  /**
   * Skips all text until the given regular expression can be matched. Returns
   * the skipped string, which is the entire tail if no match can be made.
   */
  Scanner.prototype.scanUntil = function (re) {
    var match, pos = this.tail.search(re);

    switch (pos) {
    case -1:
      match = this.tail;
      this.pos += this.tail.length;
      this.tail = "";
      break;
    case 0:
      match = "";
      break;
    default:
      match = this.tail.substring(0, pos);
      this.tail = this.tail.substring(pos);
      this.pos += pos;
    }

    return match;
  };

  function Context(view, parent) {
    this.view = view;
    this.parent = parent;
    this.clearCache();
  }

  Context.make = function (view) {
    return (view instanceof Context) ? view : new Context(view);
  };

  Context.prototype.clearCache = function () {
    this._cache = {};
  };

  Context.prototype.push = function (view) {
    return new Context(view, this);
  };

  Context.prototype.lookup = function (name) {
    var value = this._cache[name];

    if (!value) {
      if (name === ".") {
        value = this.view;
      } else {
        var context = this;

        while (context) {
          if (name.indexOf(".") > 0) {
            var names = name.split("."), i = 0;

            value = context.view;

            while (value && i < names.length) {
              value = value[names[i++]];
            }
          } else {
            value = context.view[name];
          }

          if (value != null) {
            break;
          }

          context = context.parent;
        }
      }

      this._cache[name] = value;
    }

    if (typeof value === "function") {
      value = value.call(this.view);
    }

    return value;
  };

  function Writer() {
    this.clearCache();
  }

  Writer.prototype.clearCache = function () {
    this._cache = {};
    this._partialCache = {};
  };

  Writer.prototype.compile = function (template, tags) {
    var fn = this._cache[template];

    if (!fn) {
      var tokens = exports.parse(template, tags);
      fn = this._cache[template] = this.compileTokens(tokens, template);
    }

    return fn;
  };

  Writer.prototype.compilePartial = function (name, template, tags) {
    var fn = this.compile(template, tags);
    this._partialCache[name] = fn;
    return fn;
  };

  Writer.prototype.compileTokens = function (tokens, template) {
    var fn = compileTokens(tokens);
    var self = this;

    return function (view, partials) {
      if (partials) {
        if (typeof partials === "function") {
          self._loadPartial = partials;
        } else {
          for (var name in partials) {
            self.compilePartial(name, partials[name]);
          }
        }
      }

      return fn(self, Context.make(view), template);
    };
  };

  Writer.prototype.render = function (template, view, partials) {
    return this.compile(template)(view, partials);
  };

  Writer.prototype._section = function (name, context, text, callback) {
    var value = context.lookup(name);

    switch (typeof value) {
    case "object":
      if (isArray(value)) {
        var buffer = "";

        for (var i = 0, len = value.length; i < len; ++i) {
          buffer += callback(this, context.push(value[i]));
        }

        return buffer;
      }

      return value ? callback(this, context.push(value)) : "";
    case "function":
      var self = this;
      var scopedRender = function (template) {
        return self.render(template, context);
      };

      var result = value.call(context.view, text, scopedRender);
      return result != null ? result : "";
    default:
      if (value) {
        return callback(this, context);
      }
    }

    return "";
  };

  Writer.prototype._inverted = function (name, context, callback) {
    var value = context.lookup(name);

    // Use JavaScript's definition of falsy. Include empty arrays.
    // See https://github.com/janl/mustache.js/issues/186
    if (!value || (isArray(value) && value.length === 0)) {
      return callback(this, context);
    }

    return "";
  };

  Writer.prototype._partial = function (name, context) {
    if (!(name in this._partialCache) && this._loadPartial) {
      this.compilePartial(name, this._loadPartial(name));
    }

    var fn = this._partialCache[name];

    return fn ? fn(context) : "";
  };

  Writer.prototype._name = function (name, context) {
    var value = context.lookup(name);

    if (typeof value === "function") {
      value = value.call(context.view);
    }

    return (value == null) ? "" : String(value);
  };

  Writer.prototype._escaped = function (name, context) {
    return exports.escape(this._name(name, context));
  };

  /**
   * Low-level function that compiles the given `tokens` into a function
   * that accepts three arguments: a Writer, a Context, and the template.
   */
  function compileTokens(tokens) {
    var subRenders = {};

    function subRender(i, tokens, template) {
      if (!subRenders[i]) {
        var fn = compileTokens(tokens);
        subRenders[i] = function (writer, context) {
          return fn(writer, context, template);
        };
      }

      return subRenders[i];
    }

    return function (writer, context, template) {
      var buffer = "";
      var token, sectionText;

      for (var i = 0, len = tokens.length; i < len; ++i) {
        token = tokens[i];

        switch (token[0]) {
        case "#":
          sectionText = template.slice(token[3], token[5]);
          buffer += writer._section(token[1], context, sectionText, subRender(i, token[4], template));
          break;
        case "^":
          buffer += writer._inverted(token[1], context, subRender(i, token[4], template));
          break;
        case ">":
          buffer += writer._partial(token[1], context);
          break;
        case "&":
          buffer += writer._name(token[1], context);
          break;
        case "name":
          buffer += writer._escaped(token[1], context);
          break;
        case "text":
          buffer += token[1];
          break;
        }
      }

      return buffer;
    };
  }

  /**
   * Forms the given array of `tokens` into a nested tree structure where
   * tokens that represent a section have two additional items: 1) an array of
   * all tokens that appear in that section and 2) the index in the original
   * template that represents the end of that section.
   */
  function nestTokens(tokens) {
    var tree = [];
    var collector = tree;
    var sections = [];

    var token;
    for (var i = 0, len = tokens.length; i < len; ++i) {
      token = tokens[i];
      switch (token[0]) {
      case '#':
      case '^':
        sections.push(token);
        collector.push(token);
        collector = token[4] = [];
        break;
      case '/':
        var section = sections.pop();
        section[5] = token[2];
        collector = sections.length > 0 ? sections[sections.length - 1][4] : tree;
        break;
      default:
        collector.push(token);
      }
    }

    return tree;
  }

  /**
   * Combines the values of consecutive text tokens in the given `tokens` array
   * to a single token.
   */
  function squashTokens(tokens) {
    var squashedTokens = [];

    var token, lastToken;
    for (var i = 0, len = tokens.length; i < len; ++i) {
      token = tokens[i];
      if (token[0] === 'text' && lastToken && lastToken[0] === 'text') {
        lastToken[1] += token[1];
        lastToken[3] = token[3];
      } else {
        lastToken = token;
        squashedTokens.push(token);
      }
    }

    return squashedTokens;
  }

  function escapeTags(tags) {
    return [
      new RegExp(escapeRe(tags[0]) + "\\s*"),
      new RegExp("\\s*" + escapeRe(tags[1]))
    ];
  }

  /**
   * Breaks up the given `template` string into a tree of token objects. If
   * `tags` is given here it must be an array with two string values: the
   * opening and closing tags used in the template (e.g. ["<%", "%>"]). Of
   * course, the default is to use mustaches (i.e. Mustache.tags).
   */
  exports.parse = function (template, tags) {
    template = template || '';
    tags = tags || exports.tags;

    if (typeof tags === 'string') tags = tags.split(spaceRe);
    if (tags.length !== 2) {
      throw new Error('Invalid tags: ' + tags.join(', '));
    }

    var tagRes = escapeTags(tags);
    var scanner = new Scanner(template);

    var sections = [];     // Stack to hold section tokens
    var tokens = [];       // Buffer to hold the tokens
    var spaces = [];       // Indices of whitespace tokens on the current line
    var hasTag = false;    // Is there a {{tag}} on the current line?
    var nonSpace = false;  // Is there a non-space char on the current line?

    // Strips all whitespace tokens array for the current line
    // if there was a {{#tag}} on it and otherwise only space.
    function stripSpace() {
      if (hasTag && !nonSpace) {
        while (spaces.length) {
          tokens.splice(spaces.pop(), 1);
        }
      } else {
        spaces = [];
      }

      hasTag = false;
      nonSpace = false;
    }

    var start, type, value, chr;
    while (!scanner.eos()) {
      start = scanner.pos;
      value = scanner.scanUntil(tagRes[0]);

      if (value) {
        for (var i = 0, len = value.length; i < len; ++i) {
          chr = value.charAt(i);

          if (isWhitespace(chr)) {
            spaces.push(tokens.length);
          } else {
            nonSpace = true;
          }

          tokens.push(["text", chr, start, start + 1]);
          start += 1;

          if (chr === "\n") {
            stripSpace(); // Check for whitespace on the current line.
          }
        }
      }

      start = scanner.pos;

      // Match the opening tag.
      if (!scanner.scan(tagRes[0])) {
        break;
      }

      hasTag = true;
      type = scanner.scan(tagRe) || "name";

      // Skip any whitespace between tag and value.
      scanner.scan(whiteRe);

      // Extract the tag value.
      if (type === "=") {
        value = scanner.scanUntil(eqRe);
        scanner.scan(eqRe);
        scanner.scanUntil(tagRes[1]);
      } else if (type === "{") {
        var closeRe = new RegExp("\\s*" + escapeRe("}" + tags[1]));
        value = scanner.scanUntil(closeRe);
        scanner.scan(curlyRe);
        scanner.scanUntil(tagRes[1]);
        type = "&";
      } else {
        value = scanner.scanUntil(tagRes[1]);
      }

      // Match the closing tag.
      if (!scanner.scan(tagRes[1])) {
        throw new Error('Unclosed tag at ' + scanner.pos);
      }

      // Check section nesting.
      if (type === '/') {
        if (sections.length === 0) {
          throw new Error('Unopened section "' + value + '" at ' + start);
        }

        var section = sections.pop();

        if (section[1] !== value) {
          throw new Error('Unclosed section "' + section[1] + '" at ' + start);
        }
      }

      var token = [type, value, start, scanner.pos];
      tokens.push(token);

      if (type === '#' || type === '^') {
        sections.push(token);
      } else if (type === "name" || type === "{" || type === "&") {
        nonSpace = true;
      } else if (type === "=") {
        // Set the tags for the next time around.
        tags = value.split(spaceRe);

        if (tags.length !== 2) {
          throw new Error('Invalid tags at ' + start + ': ' + tags.join(', '));
        }

        tagRes = escapeTags(tags);
      }
    }

    // Make sure there are no open sections when we're done.
    var section = sections.pop();
    if (section) {
      throw new Error('Unclosed section "' + section[1] + '" at ' + scanner.pos);
    }

    return nestTokens(squashTokens(tokens));
  };

  // The high-level clearCache, compile, compilePartial, and render functions
  // use this default writer.
  var _writer = new Writer();

  /**
   * Clears all cached templates and partials in the default writer.
   */
  exports.clearCache = function () {
    return _writer.clearCache();
  };

  /**
   * Compiles the given `template` to a reusable function using the default
   * writer.
   */
  exports.compile = function (template, tags) {
    return _writer.compile(template, tags);
  };

  /**
   * Compiles the partial with the given `name` and `template` to a reusable
   * function using the default writer.
   */
  exports.compilePartial = function (name, template, tags) {
    return _writer.compilePartial(name, template, tags);
  };

  /**
   * Compiles the given array of tokens (the output of a parse) to a reusable
   * function using the default writer.
   */
  exports.compileTokens = function (tokens, template) {
    return _writer.compileTokens(tokens, template);
  };

  /**
   * Renders the `template` with the given `view` and `partials` using the
   * default writer.
   */
  exports.render = function (template, view, partials) {
    return _writer.render(template, view, partials);
  };

  // This is here for backwards compatibility with 0.4.x.
  exports.to_html = function (template, view, partials, send) {
    var result = exports.render(template, view, partials);

    if (typeof send === "function") {
      send(result);
    } else {
      return result;
    }
  };

  return exports;

}())));



/*
 * StreamTable.js
 * version: 1.1.0 (28/7/2013)
 *
 * Licensed under the MIT:
 *   http://www.opensource.org/licenses/mit-license.php
 *
 * Copyright 2013 Jiren Patel[ jiren@joshsoftware.com ]
 *
 * Dependency:
 *  jQuery(v1.8 >=)
 */

(function(window, $) {

  'use strict';

  var StreamTable = function(container, opts, data) {
    return new _StreamTable(container, opts, data);
  };

  StreamTable.VERSION = '1.1.0';

  $.fn.stream_table = function (opts, data) {
    var $this = $(this); 
    if ($this.data('st')) return;
    $this.data('st', new _StreamTable($this.selector, opts, data));
  };

  window.StreamTable = StreamTable;

  var _StreamTable = function(container, opts, data) {
    this.data = [];
    this.main_container = container;
    this.$container = $(container);
    this.opts = opts;
    this.view = this.opts.view;
    this.text_index = [];
    this.last_search_result = [];
    this.last_search_text = '';
    this.current_page = 0;
    this.textFunc = null;
    this.stream_after = (this.opts.stream_after || 2)*1000;
    this.timer = null;
    this.opts.callbacks = this.opts.callbacks || {};

    if (!this.view) $.error('Add view function in options.');
    
    if (this.$container.get(0).tagName == 'TABLE') this.$container = this.$container.find('tbody');

    this.initPagination(this.opts.pagination || {});
    this.addSearchBox();
    this.addPerPage();
    this.has_sorting =  $(this.main_container + ' [data-sort]').length > 0 ? true : false;

    if (this.has_sorting) {
      this.sorting_opts = {};
      this.records_index = [];
      this.last_search_record_index = [];
    }

    if (data) {
      data = this.addData(data);
      this.render(0);
    }

    this.bindEvents();
    this.bindSortingEvents();
    this.streamData(this.stream_after);
  }

  var _F = _StreamTable.prototype;

  _F.getIndex = function(){
    return this.last_search_text.length > 0 ? this.last_search_record_index : this.records_index
  };

  _F.getData = function(){
    return this.last_search_text.length > 0 ? this.last_search_result : this.data;
  };

  _F.dataLength = function(){
    return this.has_sorting ? this.getIndex().length : this.getData().length;
  }

  _F.initPagination = function(opts){
    this.paging_opts = $.extend({
      span: 5,
      prev_text: '&laquo;',
      next_text: '&laquo;',
      per_page_select: true,
      per_page_opts: [10,25,50],
    }, opts);

    var p_classes = ['st_pagination'];

    if (opts.container_class){
      p_classes = [].concat.apply(p_classes, [opts.container_class])
    }

    this.paging_opts.per_page = this.paging_opts.per_page_opts[0] || 10;
    this.paging_opts.container_class = p_classes.join(' ');
    this.paging_opts.ul_class = ['pagination', opts.ul_class].join(' ');
    this.paging_opts.per_page_class = ['st_per_page', opts.per_page_class].join(' ');
    this.opts.pagination = this.paging_opts;

    $(this.main_container).after('<div class="'+ this.paging_opts.container_class  +'"></div>');

    this.$pagination = $('.' + p_classes.join('.')); 
  };

  _F.bindEvents = function(){
    var _self = this, 
        search_box = this.opts.search_box;

    $(search_box).on('keyup', function(e){
      _self.search($(this).val());
    });

    $(search_box).on('keypress', function(e){
      if ( e.keyCode == 13 ) return false;
    });

    if (_self.paging_opts.per_page_select){
      $(_self.paging_opts.per_page_select).on('change', function(){
        _self.renderByPerPage($(this).val());
      });
    }

    _self.$pagination.on('click', 'a', function(e){
      var $this = $(this), page = parseInt($this.text()), current_page;

      if (page.toString() == 'NaN'){
        if ($this.hasClass('prev')) page = 'prev';
        else if ($this.hasClass('next')) page = 'next';
        else if ($this.hasClass('first')) page = 1;
        else if ($this.hasClass('last')) page = _self.pageCount();
      }

      current_page = _self.paginate(page);
      if (current_page >= 0) {
        $('.st_pagination .active').removeClass('active');
        $('.st_pagination li[data-page='+ current_page +']').addClass('active');
      }

      return false;
    });

  };

  _F.addSearchBox = function(){
    if (this.opts.search_box) return;
    $(this.main_container).before('<input name="search" type="text" id="st_search" class="st_search" placeholder="Search Here">');
    this.opts.search_box = '#st_search';
  };

  _F._makeTextFunc = function(record){
    var fields = this.opts.fields, cond_str = [], textFunc, is_array = false;

    if (record.constructor.name == 'Object'){
      fields = fields || Object.keys(record)

      for (var i = 0, l = fields.length; i < l; i++){
        cond_str.push("d."+ fields[i]);
      }
      eval("textFunc = function(d) { return (" + cond_str.join(" + ' ' + ") + ").toUpperCase(); }");
    }else{
      if (fields){
        for(var i = 0, l = fields.length; i < l ; i++){
          cond_str.push("d["+ fields[i] + "]");
        }
        eval("textFunc = function(d) { return (" + cond_str.join(" + ' ' + ") + ").toUpperCase(); }");
      }else{
        textFunc = function(d) {
          return d.join(' ').toUpperCase(); 
        } 
      }
    }

    return textFunc;
  };

  _F.buildTextIndex = function(data){
    var i = 0, l = data.length; 

    if (!this.textFunc) this.textFunc = this._makeTextFunc(data[0]);

    for(i; i < l; i++)
      this.text_index.push(this.textFunc(data[i]));
  };

  _F.render = function(page){
    var i = (page * this.paging_opts.per_page), 
        l = (i + this.paging_opts.per_page), 
        eles = [],
        index,
        d = this.has_sorting ? this.getIndex() : this.getData();

    if (d.length < l) l = d.length;

    if (this.has_sorting){
      for (i; i < l; i++){
        eles.push(this.view(this.data[d[i]], (i+1)));
      }
    }else{
      for (i; i < l; i++){
        eles.push(this.view(d[i], (i+1)));
      }
    }
    
    this.$container.html(eles);
  };

  _F.search = function(text){
    var q = $.trim(text), count = 0;

    if (q == this.last_search_text) return;

    this.last_search_text = q;

    if(q.length == 0 ){
      this.render(0);
    }else{
      this.searchInData(q);
      this.render(0);
    } 

    this.current_page = 0;
    this.renderPagination(this.pageCount(), this.current_page);
    this.execCallbacks('pagination');
  };

  _F.searchInData = function(text){
    var result = [], 
        i = 0, 
        l = this.text_index.length, 
        t = text.toUpperCase(),
        d = this.has_sorting ? this.records_index : this.data;

    if(this.has_sorting){
      for (i; i < l; i++){
        if (this.text_index[i].indexOf(t) != -1) result.push(i);
      }
      this.last_search_record_index = result
    }else{
      for (i; i < l; i++){
        if (this.text_index[i].indexOf(t) != -1) result.push(this.data[i]);
      }
      this.last_search_result = result
    }

  };

  _F.addData = function(data){
    data = this.execCallbacks('before_add', data) || data;

    if (data.length){
      var i = this.data.length, l = data.length + i;

      this.buildTextIndex(data);
      this.data = this.data.concat(data);

      if(this.has_sorting){
        for(i; i < l; i++){
          this.records_index.push(i);
        }
      }

      if (this.last_search_text.length > 0){
        this.searchInData(this.last_search_text);
      }

      if (this.opts.auto_sorting && this.current_sorting){
        this.sort(this.current_sorting);
      }

      this.render(this.current_page);
      this.renderPagination(this.pageCount(), this.current_page);
      this.execCallbacks('after_add');
      this.execCallbacks('pagination');
    }

    return data;
  };

  _F.fetchData = function(){
    var _self = this, params = {q: this.last_search_text}

    if (this.opts.fetch_data_limit) {
      params['limit'] = this.opts.fetch_data_limit;
      params['offset'] = this.data.length;
    }

    $.getJSON(this.opts.data_url, params).done(function(data){
      data = _self.addData(data);

      if (params.limit != null && (!data || !data.length ) ) {
        _self.stopStreaming();
      }else{
        _self.setStreamInterval();
      }

    }).fail(function(e){
      _self.stopStreaming();
    });
  };

  _F.setStreamInterval = function(){
    var _self = this;
    if(_self.opts.stop_streaming == true) return;

    _self.timer = setTimeout(function(){
      _self.fetchData();
    }, _self.stream_after);
  };

  _F.stopStreaming = function(){
    this.opts.stop_streaming = true;
    if (this.timer) clearTimeout(this.timer);
  };

  _F.streamData = function(time){
    if (!this.opts.data_url) return;
    var _self = this, timer;

    _self.setStreamInterval();

    if(!_self.opts.fetch_data_limit) _self.stopStreaming();
  };

  _F.pageCount = function(){
    return Math.ceil(this.dataLength()/this.paging_opts.per_page);
  };

  //Render table rows for given page
  _F.paginate = function(page){
    var page_count = this.pageCount();

    if(page == 'prev'){ 
      page = this.current_page - 1;
    }else if (page == 'next'){
      page = this.current_page + 1;
    }else {
      page = page - 1;
    }

    if (page == this.current_page || page < 0 || page >= page_count) return;

    this.render(page);
    this.current_page = page;

    if (this.paging_opts.span <= page_count) this.renderPagination(page_count, this.current_page);

    this.execCallbacks('pagination');

    return this.current_page;
  };

  // Render Pagination call after new data added or search 
  _F.renderPagination = function(page_count, current_page){
    var i = 0, 
        l = page_count, 
        links = [ '<ul class="'+ this.paging_opts.ul_class +'">'],
        span = this.paging_opts.span,
        center = Math.ceil(span/2);

    if (page_count > span){
      links.push('<li><a href="#" class="first">First</a></li>');
      if (current_page > (center - 1) ) i = current_page - center;
      if (current_page < (page_count - center - 1) ) l = i + span;
    }

    links.push('<li><a href="#" class="prev">'+ this.paging_opts.prev_text +'</a></li>');

    for(i; i < l; i++){
      if(current_page == i){
        links.push('<li class="active" data-page="'+ i +'"><a href="#" class="active" >'+ (i + 1) +'</a></li>');
      }else{
        links.push('<li  data-page="'+ i +'"><a href="#">'+ (i + 1) +'</a></li>');
      }
    }

    links.push('<li><a href="#" class="next">'+ this.paging_opts.next_text + '</a></li>');

    if (page_count > this.paging_opts.span) links.push('<li><a href="#" class="last">Last</a></li>');

    links.push('</ul>');
    this.$pagination.html(links.join(''));
  };

  _F.addPerPage = function(){
    var per_page_select = this.paging_opts.per_page_select, html, arr;

    if (per_page_select === false || typeof per_page_select == 'string') return;
    this.paging_opts.per_page_select = '.st_per_page';

    html = ['<select size="1" name="per_page" class="'+ this.paging_opts.per_page_class +'">'];
    arr = this.paging_opts.per_page_opts;

    for(var i = 0, l = arr.length; i < l; i ++)
        html.push('<option value="'+ arr[i] + '">'+ arr[i] +'</option>');

    html.push('</select>');
    $(this.main_container).before(html.join(''));
  };

  _F.renderByPerPage = function(per_page){
    if (this.paging_opts.per_page == per_page) return;

    this.paging_opts.per_page = parseInt(per_page);
    this.current_page = 0;
    this.render(0)
    this.renderPagination(this.pageCount(), 0);
    this.execCallbacks('pagination');
  };

  _F.execCallbacks = function(type, args){
    var callback = this.opts.callbacks[type];

    if (!callback) return;

    if (type == 'pagination'){
      var f = this.paging_opts.per_page * this.current_page;
      args = {
        from:  (f + 1), 
        to:    (this.paging_opts.per_page + f),
        total: this.dataLength(), 
        page:  this.current_page 
      }

      if (args['total'] == 0) args['from'] = 0;
      if (args['to'] > args['total']) args['to'] = args['total'];
    }

    return callback.call(this, args);
  };

  _F.bindSortingEvents = function(){
    var _self = this;

    $(this.main_container + ' [data-sort]').each(function(i){
      var $el = $(this)
          ,arr = $el.data('sort').split(':')
          ,data = { dir: arr[1] || 'asc', 
                    type: arr[2] || 'string', 
                    field: arr[0] };

      _self.sorting_opts[data.field] = {dir: data.dir, type: data.type, field: data.field }

      $el.on('click', data, function(e){
        var $this = $(this);

        $this.addClass(e.data.dir);
        _self.current_sorting = {dir: e.data.dir, type: e.data.type, field: e.data.field};
        _self.sort(e.data);  
        _self.render(_self.current_page);

        e.data.dir = e.data.dir == 'asc' ? 'desc' : 'asc'; 
        $(this).removeClass(e.data.dir);
      });

      //Start sorting initialy.
      if(i == 0) $el.trigger('click');
    });
  };

  _F.sort = function(options){
    options.order = options.dir == 'asc' ? 1 : -1; 

    return this.getIndex().sort(this._sortingFunc(this.data, options));
  };

  _F._sortingFunc = function(data, options){ 
    var field = options.field, order = options.order, type = options.type;
    
    //return this.sortingFuntions[type];

    if (type ==  'number'){
      return function(i, j){
       return (data[i][field] - data[j][field]) * order;
      }
    }

    return function(i, j){
      var t1 = data[i][field].toLowerCase()
        ,t2 = data[j][field].toLowerCase();

      if (t1 < t2) return (-1 * order); 
      if (t1 > t2) return (1 * order);
      return 0;
    }
  };

  StreamTable.extend = function (name, f ) {
    _StreamTable.prototype[name] = function () {
      return f.apply( this, arguments );
    };
  };

})(this, window.jQuery)

//In IE indexOf method not define.
if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function(obj, start) {
    for (var i = (start || 0), j = this.length; i < j; i++) {
      if (this[i] === obj) { return i; }
    }
    return -1;
  }
}

if (!Object.keys) {
  Object.keys = function(obj){
    var f, fields = [];
    for(f in obj) fields.push(f);
    return fields;
  }
}





var Movies0 = [ { name: 'Once Upon a Time in the West',
  rating: '8.7',
  director: 'Sergio Leone',
  year: '1968',
  actor: 'Henry Fonda' },
{ name: 'Terminator 2: Judgment Day',
  rating: '8.6',
  director: 'James Cameron',
  year: '1991',
  actor: 'Arnold Schwarzenegger' },
{ name: 'Braveheart',
  rating: '8.4',
  director: 'Mel Gibson',
  year: '1995',
  actor: 'Mel Gibson' },
{ name: 'Oldboy',
  rating: '8.4',
  director: 'Chan-wook Park',
  year: '2003',
  actor: 'Min-sik Choi' },
{ name: 'Witness for the Prosecution',
  rating: '8.4',
  director: 'Billy Wilder',
  year: '1957',
  actor: 'Tyrone Power' },
{ name: 'Chinatown',
  rating: '8.4',
  director: 'Roman Polanski',
  year: '1974',
  actor: 'Jack Nicholson' },
{ name: 'Amadeus',
  rating: '8.4',
  director: 'Milos Forman',
  year: '1984',
  actor: 'F. Murray Abraham' },
{ name: 'Cool Hand Luke',
  rating: '8.2',
  director: 'Stuart Rosenberg',
  year: '1967',
  actor: 'Paul Newman' },
{ name: 'Ran',
  rating: '8.3',
  director: 'Akira Kurosawa',
  year: '1985',
  actor: 'Tatsuya Nakadai' },
{ name: 'Warrior',
  rating: '8.2',
  director: 'Gavin O\'Connor',
  year: '2011',
  actor: 'Tom Hardy' },
{ name: 'Butch Cassidy and the Sundance Kid',
  rating: '8.2',
  director: 'George Roy Hill',
  year: '1969',
  actor: 'Paul Newman' },
{ name: 'Into the Wild',
  rating: '8.2',
  director: 'Sean Penn',
  year: '2007',
  actor: 'Emile Hirsch' },
{ name: 'The Night of the Hunter',
  rating: '8.2',
  director: 'Charles Laughton',
  year: '1955',
  actor: 'Robert Mitchum' },
{ name: 'Persona',
  rating: '8.2',
  director: 'Ingmar Bergman',
  year: '1966',
  actor: 'Bibi Andersson' },
{ name: 'The Killing',
  rating: '8.1',
  director: 'Stanley Kubrick',
  year: '1956',
  actor: 'Sterling Hayden' },
{ name: 'Inherit the Wind',
  rating: '8.1',
  director: 'Stanley Kramer',
  year: '1960',
  actor: 'Spencer Tracy' },
{ name: '8Â½',
  rating: '8.1',
  director: 'Federico Fellini',
  year: '1963',
  actor: 'Marcello Mastroianni' },
{ name: 'Anatomy of a Murder',
  rating: '8.1',
  director: 'Otto Preminger',
  year: '1959',
  actor: 'James Stewart' },
{ name: 'The Graduate',
  rating: '8.1',
  director: 'Mike Nichols',
  year: '1967',
  actor: 'Dustin Hoffman' },
{ name: 'The Man Who Shot Liberty Valance',
  rating: '8.1',
  director: 'John Ford',
  year: '1962',
  actor: 'James Stewart' },
{ name: 'The Wild Bunch',
  rating: '8.1',
  director: 'Sam Peckinpah',
  year: '1969',
  actor: 'William Holden' },
{ name: 'Roman Holiday',
  rating: '8.1',
  director: 'William Wyler',
  year: '1953',
  actor: 'Gregory Peck' },
{ name: 'Barry Lyndon',
  rating: '8.1',
  director: 'Stanley Kubrick',
  year: '1975',
  actor: 'Ryan O\'Neal' },
{ name: 'Rio Bravo',
  rating: '8.0',
  director: 'Howard Hawks',
  year: '1959',
  actor: 'John Wayne' },
{ name: 'Elite Squad: The Enemy Within',
  rating: '8.1',
  director: 'JosÃ© Padilha',
  year: '2010',
  actor: 'Wagner Moura' },
{ name: 'Charade',
  rating: '8.0',
  director: 'Stanley Donen',
  year: '1963',
  actor: 'Cary Grant' },
{ name: 'What Ever Happened to Baby Jane?',
  rating: '8.0',
  director: 'Robert Aldrich',
  year: '1962',
  actor: 'Bette Davis' },
{ name: 'The Return',
  rating: '8.0',
  director: 'Andrey Zvyagintsev',
  year: '2003',
  actor: 'Vladimir Garin' },
{ name: 'Let the Right One In',
  rating: '8.0',
  director: 'Tomas Alfredson',
  year: '2008',
  actor: 'KÃ¥re Hedebrant' },
{ name: 'The Big Heat',
  rating: '8.0',
  director: 'Fritz Lang',
  year: '1953',
  actor: 'Glenn Ford' },
{ name: 'Being There',
  rating: '8.0',
  director: 'Hal Ashby',
  year: '1979',
  actor: 'Peter Sellers' },
{ name: 'Shame',
  rating: '7.9',
  director: 'Ingmar Bergman',
  year: '1968',
  actor: 'Liv Ullmann' },
{ name: 'Jean de Florette',
  rating: '7.9',
  director: 'Claude Berri',
  year: '1986',
  actor: 'Yves Montand' },
{ name: 'This Is Spinal Tap',
  rating: '8.0',
  director: 'Rob Reiner',
  year: '1984',
  actor: 'Rob Reiner' },
{ name: 'Midnight Cowboy',
  rating: '8.0',
  director: 'John Schlesinger',
  year: '1969',
  actor: 'Dustin Hoffman' },
{ name: 'Days of Heaven',
  rating: '7.9',
  director: 'Terrence Malick',
  year: '1978',
  actor: 'Richard Gere' },
{ name: 'A Man for All Seasons',
  rating: '7.9',
  director: 'Fred Zinnemann',
  year: '1966',
  actor: 'Paul Scofield' },
{ name: 'A Raisin in the Sun',
  rating: '7.9',
  director: 'Daniel Petrie',
  year: '1961',
  actor: 'Sidney Poitier' },
{ name: 'Head-On',
  rating: '7.9',
  director: 'Fatih Akin',
  year: '2004',
  actor: 'Birol Ãœnel' },
{ name: 'No Man\'s Land',
  rating: '7.9',
  director: 'Danis Tanovic',
  year: '2001',
  actor: 'Branko Djuric' },
{ name: 'Miller\'s Crossing',
  rating: '7.9',
  director: 'Joel Coen',
  year: '1990',
  actor: 'Gabriel Byrne' },
{ name: 'The Sacrifice',
  rating: '7.9',
  director: 'Andrei Tarkovskij',
  year: '1986',
  actor: 'Erland Josephson' },
{ name: 'Crash',
  rating: '7.9',
  director: 'Paul Haggis',
  year: '2004',
  actor: 'Don Cheadle' },
{ name: 'Kagemusha',
  rating: '7.9',
  director: 'Akira Kurosawa',
  year: '1980',
  actor: 'Tatsuya Nakadai' },
{ name: 'Forbidden Games',
  rating: '7.9',
  director: 'RenÃ© ClÃ©ment',
  year: '1952',
  actor: 'Georges Poujouly' },
{ name: 'One, Two, Three',
  rating: '7.9',
  director: 'Billy Wilder',
  year: '1961',
  actor: 'James Cagney' },
{ name: 'Hud',
  rating: '7.9',
  director: 'Martin Ritt',
  year: '1963',
  actor: 'Paul Newman' },
{ name: '4 Months, 3 Weeks and 2 Days',
  rating: '7.9',
  director: 'Cristian Mungiu',
  year: '2007',
  actor: 'Anamaria Marinca' },
{ name: 'Ferris Bueller\'s Day Off',
  rating: '7.9',
  director: 'John Hughes',
  year: '1986',
  actor: 'Matthew Broderick' },
{ name: 'The Iron Giant',
  rating: '7.9',
  director: 'Brad Bird',
  year: '1999',
  actor: 'Eli Marienthal' },
{ name: 'Kannathil Muthamittal',
  rating: '7.9',
  director: 'Mani Ratnam',
  year: '2002',
  actor: 'Madhavan' },
{ name: 'The Innocents',
  rating: '7.8',
  director: 'Jack Clayton',
  year: '1961',
  actor: 'Deborah Kerr' },
{ name: 'Diary of a Country Priest',
  rating: '7.8',
  director: 'Robert Bresson',
  year: '1951',
  actor: 'Claude Laydu' },
{ name: 'Simon',
  rating: '7.8',
  director: 'Eddy Terstall',
  year: '2004',
  actor: 'Cees Geel' },
{ name: 'The Man from Nowhere',
  rating: '7.8',
  director: 'Jeong-beom Lee',
  year: '2010',
  actor: 'Bin Won' },
{ name: 'Evil Dead II',
  rating: '7.8',
  director: 'Sam Raimi',
  year: '1987',
  actor: 'Bruce Campbell' },
{ name: 'Landscape in the Mist',
  rating: '7.8',
  director: 'Theodoros Angelopoulos',
  year: '1988',
  actor: 'Michalis Zeke' },
{ name: 'The World\'s Fastest Indian',
  rating: '7.8',
  director: 'Roger Donaldson',
  year: '2005',
  actor: 'Anthony Hopkins' },
{ name: 'Salaam Bombay!',
  rating: '7.8',
  director: 'Mira Nair',
  year: '1988',
  actor: 'Shafiq Syed' },
{ name: 'The Girl with the Dragon Tattoo',
  rating: '7.8',
  director: 'Niels Arden Oplev',
  year: '2009',
  actor: 'Michael Nyqvist' },
{ name: 'The Train',
  rating: '7.8',
  director: 'John Frankenheimer',
  year: '1964',
  actor: 'Burt Lancaster' },
{ name: 'The Edge of Heaven',
  rating: '7.8',
  director: 'Fatih Akin',
  year: '2007',
  actor: 'Baki Davrak' },
{ name: 'The Last Emperor',
  rating: '7.8',
  director: 'Bernardo Bertolucci',
  year: '1987',
  actor: 'John Lone' },
{ name: 'I Saw the Devil',
  rating: '7.8',
  director: 'Jee-woon Kim',
  year: '2010',
  actor: 'Byung-hun Lee' },
{ name: 'Johnny Got His Gun',
  rating: '7.8',
  director: 'Dalton Trumbo',
  year: '1971',
  actor: 'Timothy Bottoms' },
{ name: 'Serpico',
  rating: '7.8',
  director: 'Sidney Lumet',
  year: '1973',
  actor: 'Al Pacino' },
{ name: 'After the Wedding',
  rating: '7.7',
  director: 'Susanne Bier',
  year: '2006',
  actor: 'Mads Mikkelsen' },
{ name: 'True Grit',
  rating: '7.8',
  director: 'Ethan CoenJoel Coen',
  year: '2010',
  actor: 'Jeff Bridges' },
{ name: 'The Last of the Mohicans',
  rating: '7.7',
  director: 'Michael Mann',
  year: '1992',
  actor: 'Daniel Day-Lewis' },
{ name: 'A Place in the Sun',
  rating: '7.7',
  director: 'George Stevens',
  year: '1951',
  actor: 'Montgomery Clift' },
{ name: 'South Park: Bigger Longer & Uncut',
  rating: '7.7',
  director: 'Trey Parker',
  year: '1999',
  actor: 'Trey Parker' },
{ name: 'The Gospel According to St. Matthew',
  rating: '7.7',
  director: 'Pier Paolo Pasolini',
  year: '1964',
  actor: 'Enrique Irazoqui' },
{ name: 'Barton Fink',
  rating: '7.7',
  director: 'Joel Coen',
  year: '1991',
  actor: 'John Turturro' },
{ name: 'Kramer vs. Kramer',
  rating: '7.7',
  director: 'Robert Benton',
  year: '1979',
  actor: 'Dustin Hoffman' },
{ name: 'Mysterious Skin',
  rating: '7.7',
  director: 'Gregg Araki',
  year: '2004',
  actor: 'Brady Corbet' },
{ name: 'Guess Who\'s Coming to Dinner',
  rating: '7.7',
  director: 'Stanley Kramer',
  year: '1967',
  actor: 'Spencer Tracy' },
{ name: 'The Defiant Ones',
  rating: '7.7',
  director: 'Stanley Kramer',
  year: '1958',
  actor: 'Tony Curtis' },
{ name: 'The Court Jester',
  rating: '7.7',
  director: 'Melvin FrankNorman Panama',
  year: '1955',
  actor: 'Danny Kaye' },
{ name: 'Dead Man\'s Shoes',
  rating: '7.7',
  director: 'Shane Meadows',
  year: '2004',
  actor: 'Paddy Considine' },
{ name: 'The Taking of Pelham One Two Three',
  rating: '7.7',
  director: 'Joseph Sargent',
  year: '1974',
  actor: 'Walter Matthau' },
{ name: 'Forbidden Planet',
  rating: '7.7',
  director: 'Fred McLeod Wilcox',
  year: '1956',
  actor: 'Walter Pidgeon' },
{ name: 'Hamlet',
  rating: '7.7',
  director: 'Kenneth Branagh',
  year: '1996',
  actor: 'Kenneth Branagh' },
{ name: 'Star Trek II: The Wrath of Khan',
  rating: '7.7',
  director: 'Nicholas Meyer',
  year: '1982',
  actor: 'William Shatner' },
{ name: 'Black Hawk Down',
  rating: '7.7',
  director: 'Ridley Scott',
  year: '2001',
  actor: 'Josh Hartnett' },
{ name: 'Withnail & I',
  rating: '7.7',
  director: 'Bruce Robinson',
  year: '1987',
  actor: 'Richard E. Grant' },
{ name: 'The Haunting',
  rating: '7.7',
  director: 'Robert Wise',
  year: '1963',
  actor: 'Julie Harris' },
{ name: 'Kes',
  rating: '7.7',
  director: 'Kenneth Loach',
  year: '1969',
  actor: 'David Bradley' },
{ name: 'The Wicker Man',
  rating: '7.7',
  director: 'Robin Hardy',
  year: '1973',
  actor: 'Edward Woodward' },
{ name: 'Hugo',
  rating: '7.6',
  director: 'Martin Scorsese',
  year: '2011',
  actor: 'Asa Butterfield' },
{ name: 'Show Me Love',
  rating: '7.7',
  director: 'Lukas Moodysson',
  year: '1998',
  actor: 'Alexandra DahlstrÃ¶m' },
{ name: 'A Fish Called Wanda',
  rating: '7.6',
  director: 'Charles Crichton',
  year: '1988',
  actor: 'John Cleese' },
{ name: 'The Producers',
  rating: '7.6',
  director: 'Mel Brooks',
  year: '1968',
  actor: 'Zero Mostel' },
{ name: 'Hour of the Wolf',
  rating: '7.6',
  director: 'Ingmar Bergman',
  year: '1968',
  actor: 'Max von Sydow' },
{ name: 'Detachment',
  rating: '7.6',
  director: 'Tony Kaye',
  year: '2011',
  actor: 'Adrien Brody' },
{ name: 'A Pure Formality',
  rating: '7.6',
  director: 'Giuseppe Tornatore',
  year: '1994',
  actor: 'GÃ©rard Depardieu' },
{ name: 'Marathon',
  rating: '7.7',
  director: 'Yoon-Chul Jeong',
  year: '2005',
  actor: 'Seung-woo Cho' },
{ name: 'Where Eagles Dare',
  rating: '7.6',
  director: 'Brian G. Hutton',
  year: '1968',
  actor: 'Richard Burton' },
{ name: 'The Spy Who Came in from the Cold',
  rating: '7.6',
  director: 'Martin Ritt',
  year: '1965',
  actor: 'Richard Burton' },
{ name: 'You Can Count on Me',
  rating: '7.6',
  director: 'Kenneth Lonergan',
  year: '2000',
  actor: 'Laura Linney' },
{ name: 'The Passion of Anna',
  rating: '7.6',
  director: 'Ingmar Bergman',
  year: '1969',
  actor: 'Liv Ullmann' } ];

var Movies1 = [ { name: '13 Assassins',
  rating: '7.6',
  director: 'Takashi Miike',
  year: '2010',
  actor: 'KÃ´ji Yakusho' },
{ name: 'Y Tu MamÃ¡ TambiÃ©n',
  rating: '7.6',
  director: 'Alfonso CuarÃ³n',
  year: '2001',
  actor: 'Maribel VerdÃº' },
{ name: 'The Warriors',
  rating: '7.6',
  director: 'Walter Hill',
  year: '1979',
  actor: 'Michael Beck' },
{ name: 'Dangerous Liaisons',
  rating: '7.6',
  director: 'Stephen Frears',
  year: '1988',
  actor: 'Glenn Close' },
{ name: 'The Long Goodbye',
  rating: '7.6',
  director: 'Robert Altman',
  year: '1973',
  actor: 'Elliott Gould' },
{ name: 'The Trap',
  rating: '7.6',
  director: 'Srdan Golubovic',
  year: '2007',
  actor: 'Nebojsa Glogovac' },
{ name: 'Saturday Night and Sunday Morning',
  rating: '7.6',
  director: 'Karel Reisz',
  year: '1960',
  actor: 'Albert Finney' },
{ name: 'What\'s Up, Doc?',
  rating: '7.6',
  director: 'Peter Bogdanovich',
  year: '1972',
  actor: 'Barbra Streisand' },
{ name: 'Escape from Alcatraz',
  rating: '7.6',
  director: 'Donald Siegel',
  year: '1979',
  actor: 'Clint Eastwood' },
{ name: 'Play It Again, Sam',
  rating: '7.6',
  director: 'Herbert Ross',
  year: '1972',
  actor: 'Woody Allen' },
{ name: 'Mafioso',
  rating: '7.6',
  director: 'Alberto Lattuada',
  year: '1962',
  actor: 'Alberto Sordi' },
{ name: 'Europa Europa',
  rating: '7.6',
  director: 'Agnieszka Holland',
  year: '1990',
  actor: 'Solomon Perel' },
{ name: 'Buffet Froid',
  rating: '7.6',
  director: 'Bertrand Blier',
  year: '1979',
  actor: 'GÃ©rard Depardieu' },
{ name: 'Following',
  rating: '7.6',
  director: 'Christopher Nolan',
  year: '1998',
  actor: 'Jeremy Theobald' },
{ name: 'The Professional',
  rating: '7.6',
  director: 'Georges Lautner',
  year: '1981',
  actor: 'Jean-Paul Belmondo' },
{ name: 'Tucker and Dale vs Evil',
  rating: '7.6',
  director: 'Eli Craig',
  year: '2010',
  actor: 'Tyler Labine' },
{ name: 'Falling Down',
  rating: '7.6',
  director: 'Joel Schumacher',
  year: '1993',
  actor: 'Michael Douglas' },
{ name: 'Eat Drink Man Woman',
  rating: '7.6',
  director: 'Ang Lee',
  year: '1994',
  actor: 'Sihung Lung' },
{ name: 'Good Night, and Good Luck.',
  rating: '7.6',
  director: 'George Clooney',
  year: '2005',
  actor: 'David Strathairn' },
{ name: 'El Dorado',
  rating: '7.6',
  director: 'Howard Hawks',
  year: '1966',
  actor: 'John Wayne' },
{ name: 'The Wild Child',
  rating: '7.5',
  director: 'FranÃ§ois Truffaut',
  year: '1970',
  actor: 'FranÃ§ois Truffaut' },
{ name: 'Gallipoli',
  rating: '7.5',
  director: 'Peter Weir',
  year: '1981',
  actor: 'Mel Gibson' },
{ name: 'Water',
  rating: '7.6',
  director: 'Deepa Mehta',
  year: '2005',
  actor: 'Lisa Ray' },
{ name: 'Hunger',
  rating: '7.6',
  director: 'Steve McQueen',
  year: '2008',
  actor: 'Stuart Graham' },
{ name: 'Brothers',
  rating: '7.5',
  director: 'Susanne Bier',
  year: '2004',
  actor: 'Ulrich Thomsen' },
{ name: 'An American Werewolf in London',
  rating: '7.5',
  director: 'John Landis',
  year: '1981',
  actor: 'David Naughton' },
{ name: 'Senso',
  rating: '7.5',
  director: 'Luchino Visconti',
  year: '1954',
  actor: 'Farley Granger' },
{ name: 'The Time Machine',
  rating: '7.5',
  director: 'George Pal',
  year: '1960',
  actor: 'Rod Taylor' },
{ name: 'Swimming to Cambodia',
  rating: '7.5',
  director: 'Jonathan Demme',
  year: '1987',
  actor: 'Spalding Gray' },
{ name: 'Lilies of the Field',
  rating: '7.5',
  director: 'Ralph Nelson',
  year: '1963',
  actor: 'Sidney Poitier' },
{ name: 'Drunken Master',
  rating: '7.5',
  director: 'Woo-ping Yuen',
  year: '1978',
  actor: 'Jackie Chan' },
{ name: 'Separate Tables',
  rating: '7.5',
  director: 'Delbert Mann',
  year: '1958',
  actor: 'Rita Hayworth' },
{ name: 'Happy Together',
  rating: '7.5',
  director: 'Kar Wai Wong',
  year: '1997',
  actor: 'Leslie Cheung' },
{ name: 'A Woman Is a Woman',
  rating: '7.5',
  director: 'Jean-Luc Godard',
  year: '1961',
  actor: 'Anna Karina' },
{ name: 'When the Last Sword is Drawn',
  rating: '7.5',
  director: 'YÃ´jirÃ´ Takita',
  year: '2003',
  actor: 'Kiichi Nakai' },
{ name: 'A Little Princess',
  rating: '7.5',
  director: 'Alfonso CuarÃ³n',
  year: '1995',
  actor: 'Liesel Matthews' },
{ name: 'Jeremiah Johnson',
  rating: '7.5',
  director: 'Sydney Pollack',
  year: '1972',
  actor: 'Robert Redford' },
{ name: 'Ip Man 2: Legend of the Grandmaster',
  rating: '7.5',
  director: 'Wilson Yip',
  year: '2010',
  actor: 'Donnie Yen' },
{ name: 'Star Trek: First Contact',
  rating: '7.5',
  director: 'Jonathan Frakes',
  year: '1996',
  actor: 'Patrick Stewart' },
{ name: 'The Friends of Eddie Coyle',
  rating: '7.5',
  director: 'Peter Yates',
  year: '1973',
  actor: 'Robert Mitchum' },
{ name: 'Ghost Dog: The Way of the Samurai',
  rating: '7.5',
  director: 'Jim Jarmusch',
  year: '1999',
  actor: 'Forest Whitaker' },
{ name: 'Headhunters',
  rating: '7.5',
  director: 'Morten Tyldum',
  year: '2011',
  actor: 'Aksel Hennie' },
{ name: 'Tyrannosaur',
  rating: '7.5',
  director: 'Paddy Considine',
  year: '2011',
  actor: 'Peter Mullan' },
{ name: 'Prisoner of the Mountains',
  rating: '7.5',
  director: 'Sergey Bodrov',
  year: '1996',
  actor: 'Oleg Menshikov' },
{ name: 'A Time for Drunken Horses',
  rating: '7.5',
  director: 'Bahman Ghobadi',
  year: '2000',
  actor: 'Ayoub Ahmadi' },
{ name: 'To Catch a Thief',
  rating: '7.5',
  director: 'Alfred Hitchcock',
  year: '1955',
  actor: 'Cary Grant' },
{ name: 'Perfume: The Story of a Murderer',
  rating: '7.5',
  director: 'Tom Tykwer',
  year: '2006',
  actor: 'Ben Whishaw' },
{ name: 'Three Days of the Condor',
  rating: '7.5',
  director: 'Sydney Pollack',
  year: '1975',
  actor: 'Robert Redford' },
{ name: 'Undertow',
  rating: '7.4',
  director: 'Javier Fuentes-LeÃ³n',
  year: '2009',
  actor: 'Cristian Mercado' },
{ name: 'Tell No One',
  rating: '7.5',
  director: 'Guillaume Canet',
  year: '2006',
  actor: 'FranÃ§ois Cluzet' },
{ name: 'Witness',
  rating: '7.5',
  director: 'Peter Weir',
  year: '1985',
  actor: 'Harrison Ford' },
{ name: 'Babel',
  rating: '7.5',
  director: 'Alejandro GonzÃ¡lez IÃ±Ã¡rritu',
  year: '2006',
  actor: 'Brad Pitt' },
{ name: 'The Secret of Kells',
  rating: '7.5',
  director: 'Tomm MooreNora Twomey',
  year: '2009',
  actor: 'Evan McGuire' },
{ name: 'Fallen Angels',
  rating: '7.5',
  director: 'Kar Wai Wong',
  year: '1995',
  actor: 'Leon Lai' },
{ name: 'Flickering Lights',
  rating: '7.5',
  director: 'Anders Thomas Jensen',
  year: '2000',
  actor: 'SÃ¸ren Pilmark' },
{ name: 'Of Mice and Men',
  rating: '7.5',
  director: 'Gary Sinise',
  year: '1992',
  actor: 'John Malkovich' },
{ name: 'Mother of Mine',
  rating: '7.5',
  director: 'Klaus HÃ¤rÃ¶',
  year: '2005',
  actor: 'Topi Majaniemi' },
{ name: 'Searching for Bobby Fischer',
  rating: '7.5',
  director: 'Steven Zaillian',
  year: '1993',
  actor: 'Joe Mantegna' },
{ name: 'The Hours',
  rating: '7.5',
  director: 'Stephen Daldry',
  year: '2002',
  actor: 'Meryl Streep' },
{ name: 'Attack',
  rating: '7.5',
  director: 'Robert Aldrich',
  year: '1956',
  actor: 'Jack Palance' },
{ name: 'Small Change',
  rating: '7.5',
  director: 'FranÃ§ois Truffaut',
  year: '1976',
  actor: 'Georges Desmouceaux' },
{ name: 'Cherry Blossoms',
  rating: '7.5',
  director: 'Doris DÃ¶rrie',
  year: '2008',
  actor: 'Elmar Wepper' },
{ name: 'Kansas City Confidential',
  rating: '7.4',
  director: 'Phil Karlson',
  year: '1952',
  actor: 'John Payne' },
{ name: 'The Wedding Banquet',
  rating: '7.5',
  director: 'Ang Lee',
  year: '1993',
  actor: 'Winston Chao' },
{ name: 'Rabid Dogs',
  rating: '7.4',
  director: 'Mario Bava',
  year: '1974',
  actor: 'Lea Lander' },
{ name: 'All or Nothing',
  rating: '7.4',
  director: 'Mike Leigh',
  year: '2002',
  actor: 'Timothy Spall' },
{ name: 'The Man with the Golden Arm',
  rating: '7.4',
  director: 'Otto Preminger',
  year: '1955',
  actor: 'Frank Sinatra' },
{ name: 'In the Loop',
  rating: '7.4',
  director: 'Armando Iannucci',
  year: '2009',
  actor: 'Tom Hollander' },
{ name: 'Keith',
  rating: '7.4',
  director: 'Todd Kessler',
  year: '2008',
  actor: 'Elisabeth Harnois' },
{ name: 'Atlantic City',
  rating: '7.4',
  director: 'Louis Malle',
  year: '1980',
  actor: 'Burt Lancaster' },
{ name: 'Girl on the Bridge',
  rating: '7.4',
  director: 'Patrice Leconte',
  year: '1999',
  actor: 'Vanessa Paradis' },
{ name: 'Waiting for Guffman',
  rating: '7.4',
  director: 'Christopher Guest',
  year: '1996',
  actor: 'Christopher Guest' },
{ name: 'Secret',
  rating: '7.4',
  director: 'Jay Chou',
  year: '2007',
  actor: 'Jay Chou' },
{ name: 'Don\'t Look Now',
  rating: '7.4',
  director: 'Nicolas Roeg',
  year: '1973',
  actor: 'Julie Christie' },
{ name: 'Capote',
  rating: '7.4',
  director: 'Bennett Miller',
  year: '2005',
  actor: 'Philip Seymour Hoffman' },
{ name: 'I Want to Live!',
  rating: '7.4',
  director: 'Robert Wise',
  year: '1958',
  actor: 'Susan Hayward' },
{ name: 'Trade',
  rating: '7.4',
  director: 'Marco Kreuzpaintner',
  year: '2007',
  actor: 'Kevin Kline' },
{ name: 'The Big Combo',
  rating: '7.4',
  director: 'Joseph Lewis',
  year: '1955',
  actor: 'Richard Conte' },
{ name: 'Autumn Spring',
  rating: '7.4',
  director: 'VladimÃ­r MichÃ¡lek',
  year: '2001',
  actor: 'Vlastimil BrodskÃ½' },
{ name: 'Trading Places',
  rating: '7.4',
  director: 'John Landis',
  year: '1983',
  actor: 'Eddie Murphy' },
{ name: 'Salt of the Earth',
  rating: '7.4',
  director: 'Herbert J. Biberman',
  year: '1954',
  actor: 'Juan ChacÃ³n' },
{ name: 'School for Scoundrels',
  rating: '7.4',
  director: 'Robert Hamer',
  year: '1960',
  actor: 'Ian Carmichael' },
{ name: 'The Secret of NIMH',
  rating: '7.4',
  director: 'Don Bluth',
  year: '1982',
  actor: 'Elizabeth Hartman' },
{ name: 'The Adventures of Tintin',
  rating: '7.4',
  director: 'Steven Spielberg',
  year: '2011',
  actor: 'Jamie Bell' },
{ name: 'The Aura',
  rating: '7.4',
  director: 'FabiÃ¡n Bielinsky',
  year: '2005',
  actor: 'Ricardo DarÃ­n' },
{ name: 'Murder by Death',
  rating: '7.4',
  director: 'Robert Moore',
  year: '1976',
  actor: 'Peter Falk' },
{ name: 'Mission: Impossible - Ghost Protocol',
  rating: '7.4',
  director: 'Brad Bird',
  year: '2011',
  actor: 'Tom Cruise' },
{ name: 'The Color of Pomegranates',
  rating: '7.3',
  director: 'Sergei Parajanov',
  year: '1968',
  actor: 'Sofiko Chiaureli' },
{ name: 'Best in Show',
  rating: '7.4',
  director: 'Christopher Guest',
  year: '2000',
  actor: 'Fred Willard' },
{ name: 'Hustle & Flow',
  rating: '7.4',
  director: 'Craig Brewer',
  year: '2005',
  actor: 'Terrence Howard' },
{ name: 'Freedom Writers',
  rating: '7.4',
  director: 'Richard LaGravenese',
  year: '2007',
  actor: 'Hilary Swank' },
{ name: 'Summer and Smoke',
  rating: '7.4',
  director: 'Peter Glenville',
  year: '1961',
  actor: 'Laurence Harvey' },
{ name: 'D.O.A.',
  rating: '7.4',
  director: 'Rudolph MatÃ©',
  year: '1950',
  actor: 'Edmond O\'Brien' },
{ name: 'Lawn Dogs',
  rating: '7.4',
  director: 'John Duigan',
  year: '1997',
  actor: 'Sam Rockwell' },
{ name: 'The Good Time Girls',
  rating: '7.4',
  director: 'Claude Chabrol',
  year: '1960',
  actor: 'Bernadette Lafont' },
{ name: 'Excalibur',
  rating: '7.3',
  director: 'John Boorman',
  year: '1981',
  actor: 'Nigel Terry' },
{ name: 'The Sun',
  rating: '7.3',
  director: 'Aleksandr Sokurov',
  year: '2005',
  actor: 'Issei Ogata' },
{ name: 'Red Cliff',
  rating: '7.3',
  director: 'John Woo',
  year: '2008',
  actor: 'Tony Leung Chiu Wai' },
{ name: 'The Naked Kiss',
  rating: '7.3',
  director: 'Samuel Fuller',
  year: '1964',
  actor: 'Constance Towers' },
{ name: 'My Name Is Nobody',
  rating: '7.3',
  director: 'Tonino Valerii',
  year: '1973',
  actor: 'Terence Hill' } ];

var Movies2 = [ { name: 'Odds Against Tomorrow',
  rating: '7.3',
  director: 'Robert Wise',
  year: '1959',
  actor: 'Harry Belafonte' },
{ name: 'We\'re No Angels',
  rating: '7.3',
  director: 'Michael Curtiz',
  year: '1955',
  actor: 'Humphrey Bogart' },
{ name: 'Cyrano de Bergerac',
  rating: '7.4',
  director: 'Michael Gordon',
  year: '1950',
  actor: 'JosÃ© Ferrer' },
{ name: 'Pusher',
  rating: '7.3',
  director: 'Nicolas Winding Refn',
  year: '1996',
  actor: 'Kim Bodnia' },
{ name: 'The Bothersome Man',
  rating: '7.3',
  director: 'Jens Lien',
  year: '2006',
  actor: 'Trond Fausa' },
{ name: 'Captain Horatio Hornblower R.N.',
  rating: '7.3',
  director: 'Raoul Walsh',
  year: '1951',
  actor: 'Gregory Peck' },
{ name: 'The Man Who Loved Women',
  rating: '7.3',
  director: 'FranÃ§ois Truffaut',
  year: '1977',
  actor: 'Charles Denner' },
{ name: 'Rango',
  rating: '7.3',
  director: 'Gore Verbinski',
  year: '2011',
  actor: 'Johnny Depp' },
{ name: 'Lust for Life',
  rating: '7.3',
  director: 'Vincente Minnelli',
  year: '1956',
  actor: 'Kirk Douglas' },
{ name: 'Irreversible',
  rating: '7.3',
  director: 'Gaspar NoÃ©',
  year: '2002',
  actor: 'Monica Bellucci' },
{ name: 'The Next Three Days',
  rating: '7.3',
  director: 'Paul Haggis',
  year: '2010',
  actor: 'Russell Crowe' },
{ name: 'A Passage to India',
  rating: '7.3',
  director: 'David Lean',
  year: '1984',
  actor: 'Judy Davis' },
{ name: 'Drugstore Cowboy',
  rating: '7.3',
  director: 'Gus Van Sant Jr.',
  year: '1989',
  actor: 'Matt Dillon' },
{ name: 'I Wish',
  rating: '7.3',
  director: 'Hirokazu Koreeda',
  year: '2011',
  actor: 'Koki Maeda' },
{ name: 'People Will Talk',
  rating: '7.3',
  director: 'Joseph L. Mankiewicz',
  year: '1951',
  actor: 'Cary Grant' },
{ name: 'Crying Fist',
  rating: '7.3',
  director: 'Seung-wan Ryoo',
  year: '2005',
  actor: 'Min-sik Choi' },
{ name: 'North Face',
  rating: '7.3',
  director: 'Philipp StÃ¶lzl',
  year: '2008',
  actor: 'Benno FÃ¼rmann' },
{ name: 'Angel Heart',
  rating: '7.3',
  director: 'Alan Parker',
  year: '1987',
  actor: 'Mickey Rourke' },
{ name: 'Hombre',
  rating: '7.3',
  director: 'Martin Ritt',
  year: '1967',
  actor: 'Paul Newman' },
{ name: 'Read My Lips',
  rating: '7.3',
  director: 'Jacques Audiard',
  year: '2001',
  actor: 'Vincent Cassel' },
{ name: 'Les bronzÃ©s font du ski',
  rating: '7.3',
  director: 'Patrice Leconte',
  year: '1979',
  actor: 'Josiane Balasko' },
{ name: 'The Story of Adele H',
  rating: '7.3',
  director: 'FranÃ§ois Truffaut',
  year: '1975',
  actor: 'Isabelle Adjani' },
{ name: 'The Thing from Another World',
  rating: '7.3',
  director: 'Christian Nyby',
  year: '1951',
  actor: 'Kenneth Tobey' },
{ name: 'Manic',
  rating: '7.3',
  director: 'Jordan Melamed',
  year: '2001',
  actor: 'Joseph Gordon-Levitt' },
{ name: 'The Lincoln Lawyer',
  rating: '7.3',
  director: 'Brad Furman',
  year: '2011',
  actor: 'Matthew McConaughey' },
{ name: 'An American Crime',
  rating: '7.3',
  director: 'Tommy O\'Haver',
  year: '2007',
  actor: 'Ellen Page' },
{ name: 'Much Ado About Nothing',
  rating: '7.3',
  director: 'Kenneth Branagh',
  year: '1993',
  actor: 'Kenneth Branagh' },
{ name: 'The Music Never Stopped',
  rating: '7.3',
  director: 'Jim Kohlberg',
  year: '2011',
  actor: 'Lou Taylor Pucci' },
{ name: 'Manhattan Murder Mystery',
  rating: '7.3',
  director: 'Woody Allen',
  year: '1993',
  actor: 'Woody Allen' },
{ name: 'The Fountain',
  rating: '7.3',
  director: 'Darren Aronofsky',
  year: '2006',
  actor: 'Hugh Jackman' },
{ name: 'The Whales of August',
  rating: '7.3',
  director: 'Lindsay Anderson',
  year: '1987',
  actor: 'Bette Davis' },
{ name: 'Beverly Hills Cop',
  rating: '7.3',
  director: 'Martin Brest',
  year: '1984',
  actor: 'Eddie Murphy' },
{ name: 'Me and You and Everyone We Know',
  rating: '7.3',
  director: 'Miranda July',
  year: '2005',
  actor: 'John Hawkes' },
{ name: 'Before the Devil Knows You\'re Dead',
  rating: '7.3',
  director: 'Sidney Lumet',
  year: '2007',
  actor: 'Philip Seymour Hoffman' },
{ name: 'Marriage Italian Style',
  rating: '7.3',
  director: 'Vittorio De Sica',
  year: '1964',
  actor: 'Sophia Loren' },
{ name: 'Friend',
  rating: '7.3',
  director: 'Kyung-Taek Kwak',
  year: '2001',
  actor: 'Oh-seong Yu' },
{ name: 'Half Nelson',
  rating: '7.3',
  director: 'Ryan Fleck',
  year: '2006',
  actor: 'Ryan Gosling' },
{ name: 'Hope and Glory',
  rating: '7.3',
  director: 'John Boorman',
  year: '1987',
  actor: 'Sarah Miles' },
{ name: 'The Bad Seed',
  rating: '7.3',
  director: 'Mervyn LeRoy',
  year: '1956',
  actor: 'Nancy Kelly' },
{ name: 'The Talented Mr. Ripley',
  rating: '7.3',
  director: 'Anthony Minghella',
  year: '1999',
  actor: 'Matt Damon' },
{ name: 'Carrie',
  rating: '7.3',
  director: 'William Wyler',
  year: '1952',
  actor: 'Laurence Olivier' },
{ name: 'Pauline at the Beach',
  rating: '7.3',
  director: 'Eric Rohmer',
  year: '1983',
  actor: 'Amanda Langlet' },
{ name: 'Election',
  rating: '7.3',
  director: 'Alexander Payne',
  year: '1999',
  actor: 'Matthew Broderick' },
{ name: 'The Italian Job',
  rating: '7.3',
  director: 'Peter Collinson',
  year: '1969',
  actor: 'Michael Caine' },
{ name: 'Quest for Fire',
  rating: '7.3',
  director: 'Jean-Jacques Annaud',
  year: '1981',
  actor: 'Everett McGill' },
{ name: 'Zero Day',
  rating: '7.3',
  director: 'Ben Coccio',
  year: '2003',
  actor: 'Cal Robertson' },
{ name: 'Face/Off',
  rating: '7.3',
  director: 'John Woo',
  year: '1997',
  actor: 'John Travolta' },
{ name: 'Audition',
  rating: '7.3',
  director: 'Takashi Miike',
  year: '1999',
  actor: 'Ryo Ishibashi' },
{ name: 'The Descent',
  rating: '7.3',
  director: 'Neil Marshall',
  year: '2005',
  actor: 'Shauna Macdonald' },
{ name: 'Another Woman',
  rating: '7.3',
  director: 'Woody Allen',
  year: '1988',
  actor: 'Gena Rowlands' },
{ name: 'The Dead Zone',
  rating: '7.3',
  director: 'David Cronenberg',
  year: '1983',
  actor: 'Christopher Walken' },
{ name: 'The Private Life of Sherlock Holmes',
  rating: '7.3',
  director: 'Billy Wilder',
  year: '1970',
  actor: 'Robert Stephens' },
{ name: 'Heathers',
  rating: '7.3',
  director: 'Michael Lehmann',
  year: '1988',
  actor: 'Winona Ryder' },
{ name: 'The Science of Sleep',
  rating: '7.3',
  director: 'Michel Gondry',
  year: '2006',
  actor: 'Gael GarcÃ­a Bernal' },
{ name: 'Max Manus: Man of War',
  rating: '7.3',
  director: 'Joachim RÃ¸nningEspen Sandberg',
  year: '2008',
  actor: 'Aksel Hennie' },
{ name: 'Four Lions',
  rating: '7.3',
  director: 'Chris Morris',
  year: '2010',
  actor: 'Will Adamsdale' },
{ name: 'Quills',
  rating: '7.3',
  director: 'Philip Kaufman',
  year: '2000',
  actor: 'Geoffrey Rush' },
{ name: '...And Justice for All.',
  rating: '7.3',
  director: 'Norman Jewison',
  year: '1979',
  actor: 'Al Pacino' },
{ name: 'The Goodbye Girl',
  rating: '7.2',
  director: 'Herbert Ross',
  year: '1977',
  actor: 'Richard Dreyfuss' },
{ name: 'Funny Girl',
  rating: '7.2',
  director: 'William Wyler',
  year: '1968',
  actor: 'Barbra Streisand' },
{ name: 'God Bless America',
  rating: '7.2',
  director: 'Bobcat Goldthwait',
  year: '2011',
  actor: 'Joel Murray' },
{ name: 'Bread and Tulips',
  rating: '7.2',
  director: 'Silvio Soldini',
  year: '2000',
  actor: 'Licia Maglietta' },
{ name: 'The Parallax View',
  rating: '7.2',
  director: 'Alan J. Pakula',
  year: '1974',
  actor: 'Warren Beatty' },
{ name: 'Nobody\'s Fool',
  rating: '7.2',
  director: 'Robert Benton',
  year: '1994',
  actor: 'Paul Newman' },
{ name: 'Marat/Sade',
  rating: '7.2',
  director: 'Peter Brook',
  year: '1967',
  actor: 'Patrick Magee' },
{ name: 'Going Places',
  rating: '7.2',
  director: 'Bertrand Blier',
  year: '1974',
  actor: 'GÃ©rard Depardieu' },
{ name: 'Metropolitan',
  rating: '7.2',
  director: 'Whit Stillman',
  year: '1990',
  actor: 'Carolyn Farina' },
{ name: 'Exiled',
  rating: '7.2',
  director: 'Johnnie To',
  year: '2006',
  actor: 'Nick Cheung' },
{ name: 'Nothing But the Truth',
  rating: '7.2',
  director: 'Rod Lurie',
  year: '2008',
  actor: 'Kate Beckinsale' },
{ name: 'L\'Auberge Espagnole',
  rating: '7.2',
  director: 'CÃ©dric Klapisch',
  year: '2002',
  actor: 'Romain Duris' },
{ name: 'Re-Animator',
  rating: '7.2',
  director: 'Stuart Gordon',
  year: '1985',
  actor: 'Jeffrey Combs' },
{ name: 'A New Leaf',
  rating: '7.2',
  director: 'Elaine May',
  year: '1971',
  actor: 'Walter Matthau' },
{ name: 'Star Trek IV: The Voyage Home',
  rating: '7.2',
  director: 'Leonard Nimoy',
  year: '1986',
  actor: 'William Shatner' },
{ name: 'The Adventures of Mark Twain',
  rating: '7.2',
  director: 'Will Vinton',
  year: '1985',
  actor: 'James Whitmore' },
{ name: 'The Man of the Year',
  rating: '7.2',
  director: 'JosÃ© Henrique Fonseca',
  year: '2003',
  actor: 'Murilo BenÃ­cio' },
{ name: 'Eyes Wide Shut',
  rating: '7.2',
  director: 'Stanley Kubrick',
  year: '1999',
  actor: 'Tom Cruise' },
{ name: 'Frances',
  rating: '7.2',
  director: 'Graeme Clifford',
  year: '1982',
  actor: 'Jessica Lange' },
{ name: 'A Walk to Remember',
  rating: '7.2',
  director: 'Adam Shankman',
  year: '2002',
  actor: 'Mandy Moore' },
{ name: 'Cockfighter',
  rating: '7.2',
  director: 'Monte Hellman',
  year: '1974',
  actor: 'Warren Oates' },
{ name: 'Dumb & Dumber',
  rating: '7.2',
  director: 'Peter Farrelly',
  year: '1994',
  actor: 'Jim Carrey' },
{ name: 'Never on Sunday',
  rating: '7.2',
  director: 'Jules Dassin',
  year: '1960',
  actor: 'Melina Mercouri' },
{ name: 'Thirty Two Short Films About Glenn Gould',
  rating: '7.2',
  director: 'FranÃ§ois Girard',
  year: '1993',
  actor: 'Colm Feore' },
{ name: 'Immortal Beloved',
  rating: '7.2',
  director: 'Bernard Rose',
  year: '1994',
  actor: 'Gary Oldman' },
{ name: 'Time',
  rating: '7.2',
  director: 'Ki-duk Kim',
  year: '2006',
  actor: 'Jung-woo Ha' },
{ name: 'Mostly Martha',
  rating: '7.2',
  director: 'Sandra Nettelbeck',
  year: '2001',
  actor: 'Martina Gedeck' },
{ name: 'An American in Paris',
  rating: '7.2',
  director: 'Vincente Minnelli',
  year: '1951',
  actor: 'Gene Kelly' },
{ name: 'With Blood on My Hands: Pusher II',
  rating: '7.2',
  director: 'Nicolas Winding Refn',
  year: '2004',
  actor: 'Mads Mikkelsen' },
{ name: 'Clue',
  rating: '7.2',
  director: 'Jonathan Lynn',
  year: '1985',
  actor: 'Eileen Brennan' },
{ name: 'The Virgin Suicides',
  rating: '7.2',
  director: 'Sofia Coppola',
  year: '1999',
  actor: 'Kirsten Dunst' },
{ name: 'Seven Brides for Seven Brothers',
  rating: '7.2',
  director: 'Stanley Donen',
  year: '1954',
  actor: 'Jane Powell' },
{ name: 'A Child Is Waiting',
  rating: '7.2',
  director: 'John Cassavetes',
  year: '1963',
  actor: 'Burt Lancaster' },
{ name: 'Happy Accidents',
  rating: '7.2',
  director: 'Brad Anderson',
  year: '2000',
  actor: 'Marisa Tomei' },
{ name: 'Red Riding: In the Year of Our Lord 1983',
  rating: '7.2',
  director: 'Anand Tucker',
  year: '2009',
  actor: 'David Morrissey' },
{ name: 'Rio Grande',
  rating: '7.2',
  director: 'John Ford',
  year: '1950',
  actor: 'John Wayne' },
{ name: 'Go',
  rating: '7.2',
  director: 'Doug Liman',
  year: '1999',
  actor: 'Sarah Polley' },
{ name: 'Picnic',
  rating: '7.2',
  director: 'Joshua Logan',
  year: '1955',
  actor: 'William Holden' },
{ name: 'Fellini\'s Roma',
  rating: '7.2',
  director: 'Federico Fellini',
  year: '1972',
  actor: 'Britta Barnes' },
{ name: 'Flame and Citron',
  rating: '7.2',
  director: 'Ole Christian Madsen',
  year: '2008',
  actor: 'Thure Lindhardt' },
{ name: 'Yossi & Jagger',
  rating: '7.2',
  director: 'Eytan Fox',
  year: '2002',
  actor: 'Ohad Knoller' },
{ name: 'Genevieve',
  rating: '7.2',
  director: 'Henry Cornelius',
  year: '1953',
  actor: 'Dinah Sheridan' } ];

var Movies3 = [ { name: 'Three Kings',
  rating: '7.2',
  director: 'David O. Russell',
  year: '1999',
  actor: 'George Clooney' },
{ name: 'The Age of Innocence',
  rating: '7.2',
  director: 'Martin Scorsese',
  year: '1993',
  actor: 'Daniel Day-Lewis' },
{ name: 'Together',
  rating: '7.2',
  director: 'Kaige Chen',
  year: '2002',
  actor: 'Yun Tang' },
{ name: 'Gunfight at the O.K. Corral',
  rating: '7.2',
  director: 'John Sturges',
  year: '1957',
  actor: 'Burt Lancaster' },
{ name: 'Girl, Interrupted',
  rating: '7.2',
  director: 'James Mangold',
  year: '1999',
  actor: 'Winona Ryder' },
{ name: 'Big Night',
  rating: '7.2',
  director: 'Campbell ScottStanley Tucci',
  year: '1996',
  actor: 'Tony Shalhoub' },
{ name: 'Insomnia',
  rating: '7.2',
  director: 'Christopher Nolan',
  year: '2002',
  actor: 'Al Pacino' },
{ name: 'House by the River',
  rating: '7.2',
  director: 'Fritz Lang',
  year: '1950',
  actor: 'Louis Hayward' },
{ name: 'Highlander',
  rating: '7.2',
  director: 'Russell Mulcahy',
  year: '1986',
  actor: 'Christopher Lambert' },
{ name: 'Cul-de-sac',
  rating: '7.2',
  director: 'Roman Polanski',
  year: '1966',
  actor: 'Donald Pleasence' },
{ name: 'Red Riding: In the Year of Our Lord 1980',
  rating: '7.1',
  director: 'James Marsh',
  year: '2009',
  actor: 'Warren Clarke' },
{ name: 'The Black Stallion',
  rating: '7.2',
  director: 'Carroll Ballard',
  year: '1979',
  actor: 'Kelly Reno' },
{ name: 'Hara-Kiri: Death of a Samurai',
  rating: '7.1',
  director: 'Takashi Miike',
  year: '2011',
  actor: 'KÃ´ji Yakusho' },
{ name: 'Mao\'s Last Dancer',
  rating: '7.2',
  director: 'Bruce Beresford',
  year: '2009',
  actor: 'Chi Cao' },
{ name: 'Arlington Road',
  rating: '7.2',
  director: 'Mark Pellington',
  year: '1999',
  actor: 'Jeff Bridges' },
{ name: 'Tape',
  rating: '7.2',
  director: 'Richard Linklater',
  year: '2001',
  actor: 'Ethan Hawke' },
{ name: 'Ong-bak',
  rating: '7.2',
  director: 'Prachya Pinkaew',
  year: '2003',
  actor: 'Tony Jaa' },
{ name: 'Team America: World Police',
  rating: '7.1',
  director: 'Trey Parker',
  year: '2004',
  actor: 'Trey Parker' },
{ name: 'Star Trek VI: The Undiscovered Country',
  rating: '7.1',
  director: 'Nicholas Meyer',
  year: '1991',
  actor: 'William Shatner' },
{ name: 'The Cowboys',
  rating: '7.2',
  director: 'Mark Rydell',
  year: '1972',
  actor: 'John Wayne' },
{ name: 'In Harm\'s Way',
  rating: '7.1',
  director: 'Otto Preminger',
  year: '1965',
  actor: 'John Wayne' },
{ name: 'Super 8',
  rating: '7.1',
  director: 'J.J. Abrams',
  year: '2011',
  actor: 'Elle Fanning' },
{ name: 'Dinner Rush',
  rating: '7.1',
  director: 'Bob Giraldi',
  year: '2000',
  actor: 'Danny Aiello' },
{ name: 'Hatari!',
  rating: '7.1',
  director: 'Howard Hawks',
  year: '1962',
  actor: 'John Wayne' },
{ name: 'Zero Kelvin',
  rating: '7.2',
  director: 'Hans Petter Moland',
  year: '1995',
  actor: 'Stellan SkarsgÃ¥rd' },
{ name: 'I\'m the Angel of Death: Pusher III',
  rating: '7.1',
  director: 'Nicolas Winding Refn',
  year: '2005',
  actor: 'Zlatko Buric' },
{ name: 'The Call of Cthulhu',
  rating: '7.1',
  director: 'Andrew Leman',
  year: '2005',
  actor: 'Matt Foyer' },
{ name: '1984',
  rating: '7.1',
  director: 'Michael Radford',
  year: '1984',
  actor: 'John Hurt' },
{ name: 'Yesterday, Today and Tomorrow',
  rating: '7.1',
  director: 'Vittorio De Sica',
  year: '1963',
  actor: 'Sophia Loren' },
{ name: 'Smile',
  rating: '7.1',
  director: 'Michael Ritchie',
  year: '1975',
  actor: 'Bruce Dern' },
{ name: 'The Names of Love',
  rating: '7.1',
  director: 'Michel Leclerc',
  year: '2010',
  actor: 'Sara Forestier' },
{ name: 'Times and Winds',
  rating: '7.1',
  director: 'Reha Erdem',
  year: '2006',
  actor: 'Ozen Ozkan' },
{ name: 'Five Fingers of Death',
  rating: '7.1',
  director: 'Chang Ho Cheng',
  year: '1972',
  actor: 'Lieh Lo' },
{ name: 'Let Him Have It',
  rating: '7.1',
  director: 'Peter Medak',
  year: '1991',
  actor: 'Tom Courtenay' },
{ name: 'Pocketful of Miracles',
  rating: '7.2',
  director: 'Frank Capra',
  year: '1961',
  actor: 'Glenn Ford' },
{ name: 'Burnt Money',
  rating: '7.1',
  director: 'Marcelo PiÃ±eyro',
  year: '2000',
  actor: 'Eduardo Noriega' },
{ name: 'Sexy Beast',
  rating: '7.1',
  director: 'Jonathan Glazer',
  year: '2000',
  actor: 'Ray Winstone' },
{ name: 'Melancholia',
  rating: '7.1',
  director: 'Lars von Trier',
  year: '2011',
  actor: 'Kirsten Dunst' },
{ name: 'Big Eden',
  rating: '7.1',
  director: 'Thomas Bezucha',
  year: '2000',
  actor: 'Arye Gross' },
{ name: 'Arranged',
  rating: '7.1',
  director: 'Diane CrespoStefan C. Schaefer',
  year: '2007',
  actor: 'Zoe Lister Jones' },
{ name: 'The Paper Chase',
  rating: '7.1',
  director: 'James Bridges',
  year: '1973',
  actor: 'Timothy Bottoms' },
{ name: 'White Dog',
  rating: '7.1',
  director: 'Samuel Fuller',
  year: '1982',
  actor: 'Kristy McNichol' },
{ name: 'Hell Drivers',
  rating: '7.1',
  director: 'C. Raker Endfield',
  year: '1957',
  actor: 'Stanley Baker' },
{ name: 'Summer Hours',
  rating: '7.1',
  director: 'Olivier Assayas',
  year: '2008',
  actor: 'Juliette Binoche' },
{ name: 'Pushing Hands',
  rating: '7.1',
  director: 'Ang Lee',
  year: '1992',
  actor: 'Bo Z. Wang' },
{ name: 'The Bad News Bears',
  rating: '7.1',
  director: 'Michael Ritchie',
  year: '1976',
  actor: 'Walter Matthau' },
{ name: 'Margin Call',
  rating: '7.1',
  director: 'J.C. Chandor',
  year: '2011',
  actor: 'Zachary Quinto' },
{ name: 'My Favorite Season',
  rating: '7.1',
  director: 'AndrÃ© TÃ©chinÃ©',
  year: '1993',
  actor: 'Catherine Deneuve' },
{ name: 'Sound of Noise',
  rating: '7.1',
  director: 'Ola SimonssonJohannes StjÃ¤rne Nilsson',
  year: '2010',
  actor: 'Bengt Nilsson' },
{ name: 'Shooter',
  rating: '7.1',
  director: 'Antoine Fuqua',
  year: '2007',
  actor: 'Mark Wahlberg' },
{ name: 'Secret Reunion',
  rating: '7.1',
  director: 'Hun Jang',
  year: '2010',
  actor: 'Kang-ho Song' },
{ name: 'Late Marriage',
  rating: '7.1',
  director: 'Dover Koshashvili',
  year: '2001',
  actor: 'Lior Ashkenazi' },
{ name: 'District B13',
  rating: '7.1',
  director: 'Pierre Morel',
  year: '2004',
  actor: 'Cyril Raffaelli' },
{ name: 'The Girl Who Kicked the Hornet\'s Nest',
  rating: '7.1',
  director: 'Daniel Alfredson',
  year: '2009',
  actor: 'Michael Nyqvist' },
{ name: 'Avalon',
  rating: '7.1',
  director: 'Barry Levinson',
  year: '1990',
  actor: 'Aidan Quinn' },
{ name: 'Thieves Like Us',
  rating: '7.1',
  director: 'Robert Altman',
  year: '1974',
  actor: 'Keith Carradine' },
{ name: 'The Quiet American',
  rating: '7.1',
  director: 'Phillip Noyce',
  year: '2002',
  actor: 'Michael Caine' },
{ name: 'The Great Race',
  rating: '7.1',
  director: 'Blake Edwards',
  year: '1965',
  actor: 'Tony Curtis' },
{ name: 'The Titfield Thunderbolt',
  rating: '7.1',
  director: 'Charles Crichton',
  year: '1953',
  actor: 'Stanley Holloway' },
{ name: 'One-Eyed Jacks',
  rating: '7.1',
  director: 'Marlon Brando',
  year: '1961',
  actor: 'Marlon Brando' },
{ name: 'Quo Vadis',
  rating: '7.1',
  director: 'Mervyn LeRoy',
  year: '1951',
  actor: 'Robert Taylor' },
{ name: 'Certified Copy',
  rating: '7.1',
  director: 'Abbas Kiarostami',
  year: '2010',
  actor: 'Juliette Binoche' },
{ name: 'A Christmas Tale',
  rating: '7.1',
  director: 'Arnaud Desplechin',
  year: '2008',
  actor: 'Catherine Deneuve' },
{ name: 'The War of the Worlds',
  rating: '7.1',
  director: 'Byron Haskin',
  year: '1953',
  actor: 'Gene Barry' },
{ name: 'Catch-22',
  rating: '7.1',
  director: 'Mike Nichols',
  year: '1970',
  actor: 'Alan Arkin' },
{ name: 'The Hospital',
  rating: '7.1',
  director: 'Arthur Hiller',
  year: '1971',
  actor: 'George C. Scott' },
{ name: 'Born Free',
  rating: '7.1',
  director: 'James Hill',
  year: '1966',
  actor: 'Virginia McKenna' },
{ name: 'The Secret of Santa Vittoria',
  rating: '7.1',
  director: 'Stanley Kramer',
  year: '1969',
  actor: 'Anthony Quinn' },
{ name: 'Red Riding: In the Year of Our Lord 1974',
  rating: '7.1',
  director: 'Julian Jarrold',
  year: '2009',
  actor: 'Andrew Garfield' },
{ name: '9th Company',
  rating: '7.1',
  director: 'Fedor Bondarchuk',
  year: '2005',
  actor: 'Artur Smolyaninov' },
{ name: 'Technotise: Edit & I',
  rating: '7.1',
  director: 'Aleksa GajicNebojsa Andric',
  year: '2009',
  actor: 'Igor Bugarski' },
{ name: 'The Doors',
  rating: '7.1',
  director: 'Oliver Stone',
  year: '1991',
  actor: 'Val Kilmer' },
{ name: 'Trees Lounge',
  rating: '7.1',
  director: 'Steve Buscemi',
  year: '1996',
  actor: 'Steve Buscemi' },
{ name: 'Hawaii, Oslo',
  rating: '7.1',
  director: 'Erik Poppe',
  year: '2004',
  actor: 'Trond Espen Seim' },
{ name: 'Last Tango in Paris',
  rating: '7.1',
  director: 'Bernardo Bertolucci',
  year: '1972',
  actor: 'Marlon Brando' },
{ name: 'Defending Your Life',
  rating: '7.1',
  director: 'Albert Brooks',
  year: '1991',
  actor: 'Albert Brooks' },
{ name: 'How to Succeed in Business Without Really Trying',
  rating: '7.1',
  director: 'David Swift',
  year: '1967',
  actor: 'Robert Morse' },
{ name: 'Story of a Love Affair',
  rating: '7.1',
  director: 'Michelangelo Antonioni',
  year: '1950',
  actor: 'Lucia BosÃ©' },
{ name: 'The Devil\'s Double',
  rating: '7.1',
  director: 'Lee Tamahori',
  year: '2011',
  actor: 'Dominic Cooper' },
{ name: 'Hondo',
  rating: '7.1',
  director: 'John Farrow',
  year: '1953',
  actor: 'John Wayne' },
{ name: 'Chinese Odyssey 2002',
  rating: '7.1',
  director: 'Jeffrey Lau',
  year: '2002',
  actor: 'Tony Leung Chiu Wai' },
{ name: 'La cage aux folles',
  rating: '7.1',
  director: 'Edouard Molinaro',
  year: '1978',
  actor: 'Ugo Tognazzi' },
{ name: 'The Sons of Katie Elder',
  rating: '7.1',
  director: 'Henry Hathaway',
  year: '1965',
  actor: 'John Wayne' },
{ name: 'Angela\'s Ashes',
  rating: '7.1',
  director: 'Alan Parker',
  year: '1999',
  actor: 'Emily Watson' },
{ name: 'The Sum of Us',
  rating: '7.1',
  director: 'Geoff BurtonKevin Dowling',
  year: '1994',
  actor: 'Jack Thompson' },
{ name: 'Vincent & Theo',
  rating: '7.1',
  director: 'Robert Altman',
  year: '1990',
  actor: 'Tim Roth' },
{ name: 'A Tale of Springtime',
  rating: '7.0',
  director: 'Eric Rohmer',
  year: '1990',
  actor: 'Anne TeyssÃ¨dre' },
{ name: 'The Whistleblower',
  rating: '7.1',
  director: 'Larysa Kondracki',
  year: '2010',
  actor: 'Rachel Weisz' },
{ name: 'Von Ryan\'s Express',
  rating: '7.1',
  director: 'Mark Robson',
  year: '1965',
  actor: 'Frank Sinatra' },
{ name: 'The Adventures of Baron Munchausen',
  rating: '7.0',
  director: 'Terry Gilliam',
  year: '1988',
  actor: 'John Neville' },
{ name: 'Home Room',
  rating: '7.1',
  director: 'Paul F. Ryan',
  year: '2002',
  actor: 'Busy Philipps' },
{ name: 'Alfie',
  rating: '7.0',
  director: 'Lewis Gilbert',
  year: '1966',
  actor: 'Michael Caine' },
{ name: 'Two Lovers',
  rating: '7.0',
  director: 'James Gray',
  year: '2008',
  actor: 'Joaquin Phoenix' },
{ name: 'Rabbit Hole',
  rating: '7.0',
  director: 'John Cameron Mitchell',
  year: '2010',
  actor: 'Nicole Kidman' },
{ name: 'Coach Carter',
  rating: '7.0',
  director: 'Thomas Carter',
  year: '2005',
  actor: 'Samuel L. Jackson' },
{ name: 'Trailer Park Boys: The Movie',
  rating: '7.0',
  director: 'Mike Clattenburg',
  year: '2006',
  actor: 'Robb Wells' },
{ name: 'Gypsy',
  rating: '7.0',
  director: 'Mervyn LeRoy',
  year: '1962',
  actor: 'Rosalind Russell' },
{ name: 'The Vikings',
  rating: '7.0',
  director: 'Richard Fleischer',
  year: '1958',
  actor: 'Kirk Douglas' },
{ name: 'Westworld',
  rating: '7.0',
  director: 'Michael Crichton',
  year: '1973',
  actor: 'Yul Brynner' },
{ name: 'Le grand voyage',
  rating: '7.1',
  director: 'IsmaÃ«l Ferroukhi',
  year: '2004',
  actor: 'Nicolas CazalÃ©' } ];

var Movies4 =  [ { name: 'A Professional Gun',
  rating: '7.0',
  director: 'Sergio Corbucci',
  year: '1968',
  actor: 'Franco Nero' },
{ name: 'Equus',
  rating: '7.0',
  director: 'Sidney Lumet',
  year: '1977',
  actor: 'Richard Burton' },
{ name: 'Swimming with Sharks',
  rating: '7.0',
  director: 'George Huang',
  year: '1994',
  actor: 'Kevin Spacey' },
{ name: 'The Host',
  rating: '7.0',
  director: 'Joon-ho Bong',
  year: '2006',
  actor: 'Kang-ho Song' },
{ name: 'Bad Boys',
  rating: '7.0',
  director: 'Rick Rosenthal',
  year: '1983',
  actor: 'Sean Penn' },
{ name: 'Red',
  rating: '7.0',
  director: 'Trygve Allister DiesenLucky McKee',
  year: '2008',
  actor: 'Brian Cox' },
{ name: 'The Bubble',
  rating: '7.0',
  director: 'Eytan Fox',
  year: '2006',
  actor: 'Ohad Knoller' },
{ name: 'Buried',
  rating: '7.0',
  director: 'Rodrigo CortÃ©s',
  year: '2010',
  actor: 'Ryan Reynolds' },
{ name: 'Monkey Business',
  rating: '7.0',
  director: 'Howard Hawks',
  year: '1952',
  actor: 'Cary Grant' },
{ name: 'Soylent Green',
  rating: '7.0',
  director: 'Richard Fleischer',
  year: '1973',
  actor: 'Charlton Heston' },
{ name: 'Be with Me',
  rating: '7.0',
  director: 'Eric Khoo',
  year: '2005',
  actor: 'Theresa Poh Lin Chan' },
{ name: 'Tenebre',
  rating: '7.0',
  director: 'Dario Argento',
  year: '1982',
  actor: 'Anthony Franciosa' },
{ name: 'The Day of the Locust',
  rating: '7.0',
  director: 'John Schlesinger',
  year: '1975',
  actor: 'Donald Sutherland' },
{ name: 'Mister Foe',
  rating: '7.0',
  director: 'David Mackenzie',
  year: '2007',
  actor: 'Jamie Bell' },
{ name: 'The Streetfighter',
  rating: '7.0',
  director: 'Shigehiro Ozawa',
  year: '1974',
  actor: 'Sonny Chiba' },
{ name: 'Kiss Me, Stupid',
  rating: '7.0',
  director: 'Billy Wilder',
  year: '1964',
  actor: 'Dean Martin' },
{ name: 'One Week',
  rating: '7.0',
  director: 'Michael McGowan',
  year: '2008',
  actor: 'Joshua Jackson' },
{ name: 'Autumn Ball',
  rating: '7.1',
  director: 'Veiko Ã•unpuu',
  year: '2007',
  actor: 'Rain Tolk' },
{ name: 'Thor',
  rating: '7.0',
  director: 'Kenneth Branagh',
  year: '2011',
  actor: 'Chris Hemsworth' },
{ name: 'Swimming Upstream',
  rating: '7.0',
  director: 'Russell Mulcahy',
  year: '2003',
  actor: 'Geoffrey Rush' },
{ name: 'Ship of Fools',
  rating: '7.0',
  director: 'Stanley Kramer',
  year: '1965',
  actor: 'Vivien Leigh' },
{ name: 'The Masque of the Red Death',
  rating: '7.0',
  director: 'Roger Corman',
  year: '1964',
  actor: 'Vincent Price' },
{ name: 'Death Rides a Horse',
  rating: '7.0',
  director: 'Giulio Petroni',
  year: '1967',
  actor: 'Lee Van Cleef' },
{ name: 'The Warlords',
  rating: '7.0',
  director: 'Peter ChanWai Man Yip',
  year: '2007',
  actor: 'Jet Li' },
{ name: 'A Cop',
  rating: '7.0',
  director: 'Jean-Pierre Melville',
  year: '1972',
  actor: 'Alain Delon' },
{ name: 'Near Dark',
  rating: '7.0',
  director: 'Kathryn Bigelow',
  year: '1987',
  actor: 'Adrian Pasdar' },
{ name: 'Russian Dolls',
  rating: '7.0',
  director: 'CÃ©dric Klapisch',
  year: '2005',
  actor: 'Romain Duris' },
{ name: 'Calamity Jane',
  rating: '7.0',
  director: 'David Butler',
  year: '1953',
  actor: 'Doris Day' },
{ name: 'Mission: Impossible',
  rating: '7.0',
  director: 'Brian De Palma',
  year: '1996',
  actor: 'Tom Cruise' },
{ name: 'The Barefoot Contessa',
  rating: '7.0',
  director: 'Joseph L. Mankiewicz',
  year: '1954',
  actor: 'Humphrey Bogart' },
{ name: 'Topkapi',
  rating: '7.0',
  director: 'Jules Dassin',
  year: '1964',
  actor: 'Melina Mercouri' },
{ name: 'The Trip',
  rating: '7.0',
  director: 'Michael Winterbottom',
  year: '2010',
  actor: 'Steve Coogan' },
{ name: 'Major League',
  rating: '7.0',
  director: 'David Ward',
  year: '1989',
  actor: 'Tom Berenger' },
{ name: 'Time to Leave',
  rating: '7.0',
  director: 'FranÃ§ois Ozon',
  year: '2005',
  actor: 'Melvil Poupaud' },
{ name: 'Hellraiser',
  rating: '7.0',
  director: 'Clive Barker',
  year: '1987',
  actor: 'Andrew Robinson' },
{ name: 'The Boys from Brazil',
  rating: '7.0',
  director: 'Franklin J. Schaffner',
  year: '1978',
  actor: 'Gregory Peck' },
{ name: 'The Taming of the Shrew',
  rating: '7.0',
  director: 'Franco Zeffirelli',
  year: '1967',
  actor: 'Elizabeth Taylor' },
{ name: 'Teacher\'s Pet',
  rating: '7.0',
  director: 'George Seaton',
  year: '1958',
  actor: 'Clark Gable' },
{ name: 'Mississippi Mermaid',
  rating: '7.0',
  director: 'FranÃ§ois Truffaut',
  year: '1969',
  actor: 'Catherine Deneuve' },
{ name: 'Black Snake Moan',
  rating: '7.0',
  director: 'Craig Brewer',
  year: '2006',
  actor: 'Christina Ricci' },
{ name: 'Ashes of Time',
  rating: '7.0',
  director: 'Kar Wai Wong',
  year: '1994',
  actor: 'Brigitte Lin' },
{ name: 'No Way Out',
  rating: '7.0',
  director: 'Roger Donaldson',
  year: '1987',
  actor: 'Kevin Costner' },
{ name: 'Bronson',
  rating: '7.0',
  director: 'Nicolas Winding Refn',
  year: '2008',
  actor: 'Tom Hardy' },
{ name: 'Sunday Bloody Sunday',
  rating: '7.0',
  director: 'John Schlesinger',
  year: '1971',
  actor: 'Peter Finch' },
{ name: 'Trollhunter',
  rating: '7.0',
  director: 'AndrÃ© Ã˜vredal',
  year: '2010',
  actor: 'Otto Jespersen' },
{ name: 'McLintock!',
  rating: '7.0',
  director: 'Andrew V. McLaglen',
  year: '1963',
  actor: 'John Wayne' },
{ name: 'Syriana',
  rating: '7.0',
  director: 'Stephen Gaghan',
  year: '2005',
  actor: 'George Clooney' },
{ name: 'The Adventure Scouts',
  rating: '6.7',
  director: 'Jim Fitzpatrick',
  year: '2010',
  actor: 'Jim Fitzpatrick' },
{ name: 'We Were Soldiers',
  rating: '7.0',
  director: 'Randall Wallace',
  year: '2002',
  actor: 'Mel Gibson' },
{ name: 'Michael Collins',
  rating: '7.0',
  director: 'Neil Jordan',
  year: '1996',
  actor: 'Liam Neeson' },
{ name: 'Love Songs',
  rating: '7.0',
  director: 'Christophe HonorÃ©',
  year: '2007',
  actor: 'Ludivine Sagnier' },
{ name: 'The Hitch-Hiker',
  rating: '7.0',
  director: 'Ida Lupino',
  year: '1953',
  actor: 'Edmond O\'Brien' },
{ name: 'The Return of the Pink Panther',
  rating: '7.0',
  director: 'Blake Edwards',
  year: '1975',
  actor: 'Peter Sellers' },
{ name: 'A Woman in Berlin',
  rating: '7.0',
  director: 'Max FÃ¤rberbÃ¶ck',
  year: '2008',
  actor: 'Nina Hoss' },
{ name: 'Burn!',
  rating: '7.0',
  director: 'Gillo Pontecorvo',
  year: '1969',
  actor: 'Marlon Brando' },
{ name: 'The Out of Towners',
  rating: '7.0',
  director: 'Arthur Hiller',
  year: '1970',
  actor: 'Jack Lemmon' },
{ name: 'Bad Lieutenant',
  rating: '7.0',
  director: 'Abel Ferrara',
  year: '1992',
  actor: 'Harvey Keitel' },
{ name: 'The Girl Who Played with Fire',
  rating: '7.0',
  director: 'Daniel Alfredson',
  year: '2009',
  actor: 'Noomi Rapace' },
{ name: 'The Decameron',
  rating: '7.0',
  director: 'Pier Paolo Pasolini',
  year: '1971',
  actor: 'Franco Citti' },
{ name: 'Bully',
  rating: '7.0',
  director: 'Larry Clark',
  year: '2001',
  actor: 'Brad Renfro' },
{ name: 'Bad Timing: A Sensual Obsession',
  rating: '6.9',
  director: 'Nicolas Roeg',
  year: '1980',
  actor: 'Art Garfunkel' },
{ name: 'Affliction',
  rating: '7.0',
  director: 'Paul Schrader',
  year: '1997',
  actor: 'Nick Nolte' },
{ name: 'The Agony and the Ecstasy',
  rating: '7.0',
  director: 'Carol Reed',
  year: '1965',
  actor: 'Charlton Heston' },
{ name: 'Songcatcher',
  rating: '7.0',
  director: 'Maggie Greenwald',
  year: '2000',
  actor: 'Janet McTeer' },
{ name: 'Malcolm',
  rating: '6.9',
  director: 'Nadia Tass',
  year: '1986',
  actor: 'Colin Friels' },
{ name: 'Sunflower',
  rating: '7.0',
  director: 'Vittorio De Sica',
  year: '1970',
  actor: 'Sophia Loren' },
{ name: 'OSS 117: Cairo, Nest of Spies',
  rating: '6.9',
  director: 'Michel Hazanavicius',
  year: '2006',
  actor: 'Jean Dujardin' },
{ name: 'Gregory\'s Girl',
  rating: '6.9',
  director: 'Bill Forsyth',
  year: '1981',
  actor: 'John Gordon Sinclair' } ];

var Movies = [Movies0, Movies1, Movies2, Movies3, Movies4];





var st; //For debuggin only
$(document).ready(function() {
  var data = Movies[1], html = $.trim($("#template").html()), template = Mustache.compile(html);
  var view = function(record, index){
    return template({record: record, index: index});
  };
  var $summary = $('#summary');
  var $found = $('#found');
  var $record_count = $('#record_count');

  $('#found').hide();

  var callbacks = {
    pagination: function(summary){
      if ($.trim($('#st_search').val()).length > 0){
        $found.text('Found : '+ summary.total).show();
      }else{
        $found.hide();
      }
      $summary.text( summary.from + ' to '+ summary.to +' of '+ summary.total +' entries');
    },
    after_add: function(){
      var percent = this.data.length*100/2000;
      $record_count.text(percent + '%').attr('style', 'width:' + percent + '%');

      //Only for example: Stop ajax streaming beacause from localfile data size never going to empty.
      if (this.data.length == 2000){
        this.stopStreaming();
        $('.example .progress').removeClass('active').hide();
      }

    }
  }

  st = StreamTable('#stream_table',
    { view: view, 
      per_page: 10, 
      data_url: 'data/movies.json',
      stream_after: 0.5,
      fetch_data_limit: 100,
      callbacks: callbacks,
      pagination: {span: 5, next_text: 'Next &rarr;', prev_text: '&larr; Previous'}
    }
  , data);

     

});
