﻿///////////////////////////////////////////////////////////////////////////
// Copyright © 2014 - 2016 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define(['dojo/_base/declare',
  'dojo/_base/lang',
  'dojo/_base/html',
  'dojo/_base/array',
  'dojo/on',
  'dojo/Deferred',
  'dijit/_WidgetBase',
  'dijit/_TemplatedMixin',
  'dijit/_WidgetsInTemplateMixin',
  'dojo/Evented',
  'dojo/text!./Coordinates.html',
  'dijit/form/Select',
  'dojo/_base/array'
],
  function (declare,
    lang,
    html,
    array,
    on,
    Deferred,
    _WidgetBase,
    _TemplatedMixin,
    _WidgetsInTemplateMixin,
    Evented,
    template,
    Select,
    array) {
    return declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, Evented], {
      baseClass: 'cf-coordinates',
      declaredClass: 'CriticalFacilities.Coordinates',
      templateString: template,
      _started: null,
      label: 'Coordinates',
      parent: null,
      nls: null,
      map: null,
      appConfig: null,
      config: null,
      fields: [],
      xLabel: "",
      yLabel: "",
      theme: '',
      isDarkTheme: '',
      styleColor: '',

      constructor: function (options) {
        lang.mixin(this, options);
      },

      postCreate: function () {
        this.inherited(arguments);
        this.lblX.innerHTML = this.xLabel + ":";
        this.lblY.innerHTML = this.yLabel + ":";
        this._setFields(this.fields);
      },

      startup: function () {
        this._started = true;
        this._updateAltIndexes();
      },

      onShown: function () {
        console.log('Coordinates shown');
      },

      validate: function (type, result) {
        var def = new Deferred();
        if (type === 'next-view') {
          def.resolve(this._nextView(result));
        } else if (type === 'back-view') {
          def.resolve(this._backView(result));
        }
        return def;
      },

      _updateAltIndexes: function () {
        //No gaurentee that page container will exist prior to when the view is created
        // However, it must exist for the page to be shown
        if (this.pageContainer && !this._startPageView) {
          //this.own(on(this.pageContainer, 'next-view', lang.hitch(this, this._nextView)));
          //this.own(on(this.pageContainer, 'back-view', lang.hitch(this, this._backView)));

          this._startPageView = this.pageContainer.getViewByTitle('StartPage');
          this._locationTypeView = this.pageContainer.getViewByTitle('LocationType');

          if (this._startPageView && this._locationTypeView) {
            this.altNextIndex = this._startPageView.index;
            this.altBackIndex = this._locationTypeView.index;
          }
        }
      },

      _nextView: function (nextResult) {
        //The assumption is that if they click next the definition of mapping is complete
        //  This may need a better approach to evaluate when it is actually complete rather than just when they have clicked next
        //  Need to keep in mind that they could have the auto recognized fields established and never have to click a select control
        if (nextResult.currentView.label === this.label) {
          this.parent._locationMappingComplete = true;
          this.emit('location-mapping-update', true);
        }
        return true;
      },

      _backView: function (backResult) {
        //The assumption is that if they click back the definition of mapping is not complete
        //  This may need a better approach to evaluate when it is actually complete rather than just when they have clicked next
        //  Need to keep in mind that they could have the auto recognized fields established and never have to click a select control
        if (backResult.currentView.label === this.label) {
          this.parent._locationMappingComplete = false;
          this.emit('location-mapping-update', false);
        }
        return true;
      },

      _setFields: function (fields) {
        //fields needs to look like this:
        //[{
        //  label: this.nls.miles,
        //  value: "miles",
        //  xSelected or ySelected: true
        //}, {...}]

        array.forEach(fields, lang.hitch(this, function (f) {
          this.selectX.addOption({
            label: f.label,
            value: f.value,
            selected: typeof (f.xSelected) === 'undefined' ? false : f.xSelected
          });
          this.selectY.addOption({
            label: f.label,
            value: f.value,
            selected: typeof (f.ySelected) === 'undefined' ? false : f.ySelected
          });
        }));
      },

      setStyleColor: function (styleColor) {
        this.styleColor = styleColor;
      },

      updateImageNodes: function () {
        //TODO toggle white/black images
      },

      updateTheme: function (theme) {
        this.theme = theme;
      },

      _getResults: function () {
        return {
          type: "Coordinates",
          fields: [{
            targetField: "X",
            sourceField: this.selectX.value
          }, {
            targetField: "Y",
            sourceField: this.selectY.value
          }]
        };

      }

    });
  });