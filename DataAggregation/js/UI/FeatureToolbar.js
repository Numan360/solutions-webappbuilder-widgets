///////////////////////////////////////////////////////////////////////////
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
  'dojo/_base/array',
  'dojo/Evented',
  'dojo/query',
  'dojo/dom-class',
  'dojo/dom-construct',
  'dojo/Deferred',
  'dijit/_WidgetBase',
  'dijit/_TemplatedMixin',
  'dojo/on',
  'dojo/text!./templates/FeatureToolbar.html',
  'esri/toolbars/edit',
  'jimu/dijit/Popup',
  'esri/geometry/Point',
  'esri/geometry/webMercatorUtils',
  'esri/SpatialReference'
],
  function (declare,
    lang,
    array,
    Evented,
    query,
    domClass,
    domConstruct,
    Deferred,
    _WidgetBase,
    _TemplatedMixin,
    on,
    template,
    Edit,
    Popup,
    Point,
    webMercatorUtils, SpatialReference) {
    return declare([_WidgetBase, _TemplatedMixin, Evented], {
      templateString: template,

      'baseClass': 'cf-feature-toolbar',
      declaredClass: 'FeatureToolbar',
      label: "FeatureToolbar",

      parent: null,
      nls: null,
      map: null,
      appConfig: null,
      config: null,
      feature: null,
      layer: null,
      theme: '',
      isDarkTheme: '',
      locators: [],
      styleColor: '',
      featureView: null,
      _editToolbar: null,
      csvStore: null,
      _isAddressFeature: true,

      //TODO add message on save when is duplicate...at this point ask them if they would like to keep both or overwrite

      constructor: function (options) {
        lang.mixin(this, options);

        //enable editing when pencil is clicked
        this._editDisabled = true;

        //enable save when change to geometry or attributes
        this._saveDisabled = true;

        //enable locate when change to address
        this._locateDisabled = true;

        //Used to store and listen when a change occurs
        this._hasAttributeEdit = false;
        this.own(on(this.featureView, 'attribute-change', lang.hitch(this, this._attributeChange)));

        this._hasAddressEdit = false;
        this.own(on(this.featureView, 'address-change', lang.hitch(this, this._addressChange)));

        this._hasGeometryEdit = false;
        this.own(on(this._editToolbar, 'graphic-move-stop', lang.hitch(this, this._graphicMoveStop)));
        this.own(on(this.featureView, 'address-located', lang.hitch(this, this._graphicMoveStop)));

        this.locator = this._getLocator();
      },

      postCreate: function () {
        this.inherited(arguments);
        this._darkThemes = ['DartTheme', 'DashboardTheme'];
        this.updateImageNodes();
      },

      startup: function () {
        this.inherited(arguments);
        this._started = true;
        this.featureView._toggleEditControls(this._editDisabled);
      },

      _getLocator: function () {
        //TODO need to have a backup if none of the locators support location to address
        var locator;
        for (var i = 0; i < this.csvStore._geocodeSources.length; i++) {
          var locatorSource = this.csvStore._geocodeSources[0];
          locator = locatorSource.locator;
          if (locator.locationToAddress) {
            break;
          }
        }
        if (locator) {
          locator.outSpatialReference = this.spatialReference;
        }
        return locator;
      },

      _attributeChange: function (v) {
        this._hasAttributeEdit = v;
        if (this.featureView.isDuplicate && this.featureView._useGeomFromLayer) {
          this._updateSave(!(this._hasAttributeEdit));
        } else {
          this._updateSave(!(this._hasAttributeEdit || this._hasGeometryEdit));
        }
      },

      _addressChange: function (v) {
        this._hasAddressEdit = v;
        this._updateLocate(!v);
      },

      _graphicMoveStop: function (result) {
        this._hasGeometryEdit = true;
        if (this.featureView.isDuplicate && this.featureView._useGeomFromLayer) {
          this._updateSave(!(this._hasAttributeEdit));
        } else {
          this._updateSave(!(this._hasAttributeEdit || this._hasGeometryEdit));
        }
        this.map.infoWindow.setFeatures(this.featureView._feature);
        this.map.infoWindow.select(0);

        //I fire graphicMoveStop when locating...in that case it's based off of the address the user entered
        //no need to reverse geocode again
        if (result) {
          this._reverseLocate(result.graphic.geometry);
        }
      },

      _reverseLocate: function (geometry) {
        if (this._isAddressFeature) {
          this.locator.locationToAddress(geometry, 100).then(lang.hitch(this, function (result) {
            //TODO should this honor the configured match score limit...if
            this.featureView._updateAddressFields(result.address);
          }));
        } else {
          //TODO support the same for coiordinate feature...should return xy
          this.featureView._updateAddressFields(geometry);
        }
      },

      _edit: function () {
        this._editDisabled = !this._editDisabled;
        this._updateEdit(this._editDisabled);

        this.featureView._toggleEditControls(this._editDisabled);

        if (this.map.infoWindow.isShowing) {
          this.map.infoWindow.hide();
        }

        if (!this._editDisabled) {
          this._editToolbar.activate(Edit.MOVE, this.featureView._feature);
          if (this.featureView.isDuplicate) {
            this.featureView._panToAndSelectFeature(this.featureView._useGeomFromFile ?
              this.featureView._feature : this.featureView._editFeature);
            if (this.featureView._useGeomFromFile) {
              this._updateSave(!(this._hasAttributeEdit || this._hasGeometryEdit));
            } else {
              this._updateSave(!(this._hasAttributeEdit));
            }
          } else {
            this.featureView._panToAndSelectFeature(this.featureView._feature);
            this._updateSave(!(this._hasAttributeEdit || this._hasGeometryEdit));
          }
        } else {
          this._editToolbar.refresh();
          this._editToolbar.deactivate();
          this._updateSave(true);
          this.map.infoWindow.clearFeatures();
        }
      },

      _locate: function () {
        //locate feature
        this._locateFeature().then(lang.hitch(this, function () {
          //disable locate
          this._updateLocate(true);
        }));
      },

      _save: function () {
        var values = this.featureView._getEditValues();
        if (this.featureView.isDuplicate) {
          this._showDuplicateSavePopup().then(lang.hitch(this, function (results) {
            if (results.save) {
              switch (results.type) {
                case 'overwrite':
                  array.forEach(Object.keys(values), lang.hitch(this, function (k) {
                    if (k !== '_rows') {
                      this.featureView._editFeature.attributes[k] = values[k];
                    }
                  }));
                  if (this._hasGeometryEdit && this.featureView._useGeomFromFile) {
                    this.featureView._editFeature.geometry = this.featureView._feature.geometry;
                  }
                  this.parent.editLayer.applyEdits(null, [this.featureView._editFeature], null)
                    .then(lang.hitch(this, function (s) {
                      console.log(s);
                      if (this._hasGeometryEdit && this.featureView._useGeomFromFile) {
                        this._hasGeometryEdit = false;
                      }

                      array.forEach(values._rows, function (r) {
                        //update the row instance with the new value
                        var newValue = values[r.fieldName];
                        r.layerValue = newValue;
                        r.fileValue = r.useFile ? newValue : r.fileValue;
                        r.layerValueTextBox.set('value', newValue);
                      });
                    }));
                  break;
                case 'both':
                  array.forEach(Object.keys(values), lang.hitch(this, function (k) {
                    if (k !== '_rows') {
                      this.featureView._feature.attributes[k] = values[k];
                    }
                  }));
                  var updateFeature = this.featureView._feature;
                  array.forEach(this.featureView._skipFields, lang.hitch(this, function (sf) {
                    if (sf !== this.layer.objectIdField) {
                      delete updateFeature.attributes[sf];
                    }
                  }));
                  this.parent.editLayer.applyEdits([updateFeature], null, null).then(lang.hitch(this, function (r) {
                    console.log(r);
                    if (this._hasGeometryEdit && this.featureView._useGeomFromFile) {
                      this._hasGeometryEdit = false;
                    }
                  }));
                  break;
              }

              //disable save
              this._updateSave(true);
              //toggle edit
              this._edit();
            }
          }));
        } else {
          array.forEach(Object.keys(values), lang.hitch(this, function (k) {
            if (k !== '_rows') {
              this.featureView._feature.attributes[k] = values[k];
            }
          }));

          var updateFeature = this.featureView._feature;
          if (this.featureView.label.indexOf('UnMatched') === -1) {
            this.layer.applyEdits(null, [updateFeature], null).then(lang.hitch(this, function (r) {
              console.log(r);
              this._hasGeometryEdit = false;
              this._hasAttributeEdit = false;
            }));
          } else {

            //TODO not complete...vew needs to be fully removed...list updated and the fetaureList re-generated or removed
            array.forEach(this.featureView._skipFields, lang.hitch(this, function (sf) {
              delete updateFeature.attributes[sf];
            }));
            this.parent.editLayer.applyEdits([updateFeature], null, null).then(lang.hitch(this, function (r) {
              console.log(r);
              this._hasGeometryEdit = false;
              this._hasAttributeEdit = false;
            }));
            //this.parent._pageContainer.removeViewByTitle(this.featureView.label);
          }

          //disable save
          this._updateSave(true);
          //toggle edit
          this._edit();
        }
      },

      _locateFeature: function () {
        var def = new Deferred();

        //return feature from locationToAddress
        var address = this.featureView._getAddressFieldsValues();
        if (this._isAddressFeature) {
          this.locator.addressToLocations(address).then(lang.hitch(this, function (result) {
            var highestScoreItem;
            if (result.length > 0) {
              for (var i = 0; i < result.length; i++) {
                var item = result[i];
                if (typeof (highestScoreItem) === 'undefined') {
                  highestScoreItem = item;
                }
                if (highestScoreItem && item.score > highestScoreItem.score) {
                  highestScoreItem = item;
                }
              }
              this.featureView._updateFeature(highestScoreItem.location, highestScoreItem.address);
              def.resolve(this.featureView.feature);
            }
          }));
        } else {
          var x = address[this.xField];
          var y = address[this.yField];

          var isGeographic;
          if (typeof (isGeographic) === 'undefined') {
            isGeographic = /(?=^[-]?\d{1,3}\.)^[-]?\d{1,3}\.\d+|(?=^[-]?\d{4,})|^[-]?\d{1,3}/.exec(x) ? true : false;
          }

          var geometry;
          if (!isNaN(x) && !isNaN(y)) {
            geometry = new Point(x, y);
            if (isGeographic) {
              geometry = webMercatorUtils.geographicToWebMercator(geometry);
            } else {
              geometry.spatialReference = new SpatialReference({ wkid: this.map.spatialReference.wkid });
            }
          }
          this.featureView._updateFeature(geometry, address);
          def.resolve(this.featureView.feature);
        }
        return def;
      },

      setStyleColor: function (styleColor) {
        this.styleColor = styleColor;
      },

      _updateEdit: function (disabled) {
        this._editDisabled = disabled;
        this._updateImageNode('bg-edit', 'bg-edit-white', 'bg-edit-disabled', this._editDisabled);
      },

      _updateSave: function (disabled) {
        this._saveDisabled = disabled;
        this._updateImageNode('bg-save', 'bg-save-white', 'bg-save-disabled', this._saveDisabled);
      },

      _updateLocate: function (disabled) {
        this._locateDisabled = disabled;
        this._updateImageNode('bg-locate', 'bg-locate-white', 'bg-locate-disabled', this._locateDisabled);
      },

      updateImageNodes: function () {
        //toggle all images
        this._updateImageNode('bg-edit', 'bg-edit-white', 'bg-edit-disabled', this._editDisabled);
        this._updateImageNode('bg-save', 'bg-save-white', 'bg-save-disabled', this._saveDisabled);
        this._updateImageNode('bg-locate', 'bg-locate-white', 'bg-locate-disabled', this._locateDisabled);
      },

      _updateImageNode: function (img, imgWhite, imgDisabled, isDisabled) {
        var isDark = this._darkThemes.indexOf(this.theme) > -1;
        var addClass = isDisabled ? imgDisabled : isDark ? imgWhite : img;

        //var removeClass = isDark ? img : imgWhite;
        var removeClass = imgWhite;
        var nodesFound = false;
        var imageNodes = query('.' + img, this.domNode);
        if (imageNodes.hasOwnProperty('length') && imageNodes.length === 0) {
          imageNodes = query('.' + imgDisabled, this.domNode);
        } else {
          nodesFound = true;
          removeClass = img;
        }

        if (!nodesFound && imageNodes.hasOwnProperty('length') && imageNodes.length === 0) {
          imageNodes = query('.' + imgWhite, this.domNode);
        } else {
          if (!nodesFound) {
            nodesFound = true;
            removeClass = imgDisabled;
          }
        }
        array.forEach(imageNodes, function (node) {
          domClass.remove(node, removeClass);
          domClass.add(node, addClass);
        });
      },

      updateTheme: function (theme) {
        this.theme = theme;
      },

      _showDuplicateSavePopup: function () {
        var def = new Deferred();
        var content = domConstruct.create('div');

        domConstruct.create('div', {
          innerHTML: 'Would you like to overwrite the existing feature?'
        }, content);

        if (this.featureView._useGeomFromFile || this.featureView._useValuesFromFile) {
          //if using values or geom from file see if they want to overwrite or store both
          var savePopup = new Popup({
            titleLabel: "Overwrite Feature",
            width: 400,
            autoHeight: true,
            content: content,
            buttons: [{
              label: this.nls.yes,
              onClick: lang.hitch(this, function () {
                savePopup.close();
                savePopup = null;
                def.resolve({ save: true, type: 'overwrite' });
              })
            }, {
              label: this.nls.no,
              onClick: lang.hitch(this, function () {
                savePopup.close();
                savePopup = null;
                def.resolve({ save: true, type: 'both' });
              })
            }, {
              label: this.nls.cancel,
              classNames: ['jimu-btn-vacation'],
              onClick: lang.hitch(this, function () {
                savePopup.close();
                savePopup = null;
                def.resolve({ save: false, type: undefined });
              })
            }],
            onClose: function () {
              savePopup = null;
            }
          });
        } else {
          def.resolve({ save: true, type: 'overwrite' });
        }
        return def;
      }
    });
  });