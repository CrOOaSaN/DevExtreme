import $ from '../../core/renderer';
import eventsEngine from '../../events/core/events_engine';
import browser from '../../core/utils/browser';
import { deferUpdate, deferRender, ensureDefined } from '../../core/utils/common';
import { isPlainObject, isDefined } from '../../core/utils/type';
import { getWindow, hasWindow } from '../../core/utils/window';
import domAdapter from '../../core/dom_adapter';
import registerComponent from '../../core/component_registrator';
import DOMComponent from '../../core/dom_component';
import { focusable } from '../widget/selectors';
import { addNamespace } from '../../events/utils/index';
import { when } from '../../core/utils/deferred';

const SCROLLABLE = 'dxScrollable';
const SCROLLABLE_STRATEGY = 'dxScrollableStrategy';
const SCROLLABLE_CLASS = 'dx-scrollable';
const SCROLLABLE_CONTENT_CLASS = 'dx-scrollable-content';
const VERTICAL = 'vertical';
const HORIZONTAL = 'horizontal';

const Scrollable = DOMComponent.inherit({
    _initOptions: function(options) {
        this.callBase(options);
        if(!('useSimulatedScrollbar' in options)) {
            this._setUseSimulatedScrollbar();
        }
    },

    _setUseSimulatedScrollbar: function() {
        if(!this.initialOption('useSimulatedScrollbar')) {
            this.option('useSimulatedScrollbar', !this.option('useNative'));
        }
    },

    _init: function() {
        this.callBase();
        this._initScrollableMarkup();
        this._locked = false;
    },

    _getWindowDevicePixelRatio: function() {
        return hasWindow()
            ? getWindow().devicePixelRatio
            : 1;
    },

    _visibilityChanged: function(visible) {
        if(visible) {
            this.update();
            this._updateRtlPosition();
            this._savedScrollOffset && this.scrollTo(this._savedScrollOffset);
            delete this._savedScrollOffset;
        } else {
            this._savedScrollOffset = this.scrollOffset();
        }
    },

    _initScrollableMarkup: function() {
        if(domAdapter.hasDocumentProperty('onbeforeactivate') && browser.msie && browser.version < 12) {
            // eslint-disable-next-line no-undef
            eventsEngine.on($element, addNamespace('beforeactivate', SCROLLABLE), function(e) {
                if(!$(e.target).is(focusable)) {
                    e.preventDefault();
                }
            });
        }
    },

    _dimensionChanged: function() {
        this.update();
        this._updateRtlPosition();
    },

    _initMarkup: function() {
        this.callBase();
    },

    _render: function() {
        this._renderStrategy();

        this._renderDisabledState();
        this.update();

        this.callBase();

        this._rtlConfig = {
            scrollRight: 0,
            clientWidth: this._container().get(0).clientWidth,
            windowPixelRatio: this._getWindowDevicePixelRatio()
        };
        this._updateRtlPosition();
    },

    _isHorizontalAndRtlEnabled: function() {
        return this.option('rtlEnabled') && this.option('direction') !== VERTICAL;
    },

    _updateRtlPosition: function() {
        this._updateBounds();
        if(this._isHorizontalAndRtlEnabled()) {
            deferUpdate(() => {
                let scrollLeft = this._getMaxOffset().left - this._rtlConfig.scrollRight;

                if(scrollLeft <= 0) {
                    scrollLeft = 0;
                    this._rtlConfig.scrollRight = this._getMaxOffset().left;
                }

                deferRender(() => {
                    if(this.scrollLeft() !== scrollLeft) {
                        this._rtlConfig.skipUpdating = true;
                        this.scrollTo({ left: scrollLeft });
                        this._rtlConfig.skipUpdating = false;
                    }
                });
            });
        }
    },

    _getMaxOffset: function() {
        const { scrollWidth, clientWidth, scrollHeight, clientHeight } = this._container().get(0);

        return {
            left: scrollWidth - clientWidth,
            top: scrollHeight - clientHeight,
        };
    },

    _updateBounds: function() {
        this._strategy.updateBounds();
    },

    _updateRtlConfig: function() {
        if(this._isHorizontalAndRtlEnabled() && !this._rtlConfig.skipUpdating) {
            const { clientWidth, scrollLeft } = this._container().get(0);
            const windowPixelRatio = this._getWindowDevicePixelRatio();
            if(this._rtlConfig.windowPixelRatio === windowPixelRatio && this._rtlConfig.clientWidth === clientWidth) {
                this._rtlConfig.scrollRight = this._getMaxOffset().left - scrollLeft;
            }
            this._rtlConfig.clientWidth = clientWidth;
            this._rtlConfig.windowPixelRatio = windowPixelRatio;
        }
    },

    _renderDisabledState: function() {
        if(this.option('disabled')) {
            this._lock();
        } else {
            this._unlock();
        }
    },

    _renderStrategy: function() {
        this._strategy.render();
        this.$element().data(SCROLLABLE_STRATEGY, this._strategy);
    },

    _clean: function() {
        this._strategy && this._strategy.dispose();
    },

    _optionChanged: function(args) {
        switch(args.name) {
            case 'onStart':
            case 'onEnd':
            case 'onStop':
            case 'onUpdated':
            case 'onScroll':
            case 'onBounce':
                this._createActions();
                break;
            case 'direction':
                this._resetInactiveDirection();
                this._invalidate();
                break;
            case 'useNative':
                this._setUseSimulatedScrollbar();
                this._invalidate();
                break;
            case 'inertiaEnabled':
            case 'scrollByContent':
            case 'scrollByThumb':
            case 'bounceEnabled':
            case 'useKeyboard':
            case 'showScrollbar':
            case 'useSimulatedScrollbar':
            case 'pushBackValue':
                this._invalidate();
                break;
            case 'disabled':
                this._renderDisabledState();
                this._strategy && this._strategy.disabledChanged();
                break;
            case 'updateManually':
                break;
            case 'width':
                this.callBase(args);
                this._updateRtlPosition();
                break;
            default:
                this.callBase(args);
        }
    },

    _resetInactiveDirection: function() {
        const inactiveProp = this._getInactiveProp();
        if(!inactiveProp || !hasWindow()) {
            return;
        }

        const scrollOffset = this.scrollOffset();
        scrollOffset[inactiveProp] = 0;
        this.scrollTo(scrollOffset);
    },

    _getInactiveProp: function() {
        const direction = this.option('direction');
        if(direction === VERTICAL) {
            return 'left';
        }
        if(direction === HORIZONTAL) {
            return 'top';
        }
    },

    _location: function() {
        return this._strategy.location();
    },

    _normalizeLocation: function(location) {
        if(isPlainObject(location)) {
            const left = ensureDefined(location.left, location.x);
            const top = ensureDefined(location.top, location.y);
            return {
                left: isDefined(left) ? -left : undefined,
                top: isDefined(top) ? -top : undefined
            };
        } else {
            const direction = this.option('direction');
            return {
                left: direction !== VERTICAL ? -location : undefined,
                top: direction !== HORIZONTAL ? -location : undefined
            };
        }
    },

    _isLocked: function() {
        return this._locked;
    },

    _lock: function() {
        this._locked = true;
    },

    _unlock: function() {
        if(!this.option('disabled')) {
            this._locked = false;
        }
    },

    // _isDirection: function(direction) {
    //     const current = this.option('direction');
    //     if(direction === VERTICAL) {
    //         return current !== HORIZONTAL;
    //     }
    //     if(direction === HORIZONTAL) {
    //         return current !== VERTICAL;
    //     }
    //     return current === direction;
    // },

    _container: function() {
        return this._$container;
    },

    $content: function() {
        return this._$content;
    },

    scrollHeight: function() {
        return this.$content().outerHeight() - 2 * this._strategy.verticalOffset();
    },

    update: function() {
        if(!this._strategy) {
            return;
        }
        return when(this._strategy.update()).done((function() {
            this._updateAllowedDirection();
        }).bind(this));
    },

    scrollBy: function(distance) {
        distance = this._normalizeLocation(distance);

        if(!distance.top && !distance.left) {
            return;
        }

        this._updateIfNeed();
        this._strategy.scrollBy(distance);
        this._updateRtlConfig();
    },

    scrollTo: function(targetLocation) {
        targetLocation = this._normalizeLocation(targetLocation);

        this._updateIfNeed();

        let location = this._location();

        if(!this.option('useNative')) {
            targetLocation = this._strategy._applyScaleRatio(targetLocation);
            location = this._strategy._applyScaleRatio(location);
        }

        const distance = this._normalizeLocation({
            left: location.left - ensureDefined(targetLocation.left, location.left),
            top: location.top - ensureDefined(targetLocation.top, location.top)
        });

        if(!distance.top && !distance.left) {
            return;
        }

        this._strategy.scrollBy(distance);
        this._updateRtlConfig();
    },

    // scrollToElement: function(element, offset) {
    //     const $element = $(element);
    //     const elementInsideContent = this.$content().find(element).length;
    //     const elementIsInsideContent = ($element.parents('.' + SCROLLABLE_CLASS).length - $element.parents('.' + SCROLLABLE_CONTENT_CLASS).length) === 0;
    //     if(!elementInsideContent || !elementIsInsideContent) {
    //         return;
    //     }

    //     const scrollPosition = { top: 0, left: 0 };
    //     const direction = this.option('direction');

    //     if(direction !== VERTICAL) {
    //         scrollPosition.left = this.getScrollElementPosition($element, HORIZONTAL, offset);
    //     }
    //     if(direction !== HORIZONTAL) {
    //         scrollPosition.top = this.getScrollElementPosition($element, VERTICAL, offset);
    //     }

    //     this.scrollTo(scrollPosition);
    // },

    scrollToElementTopLeft: function(element) {
        const $element = $(element);
        const elementInsideContent = this.$content().find(element).length;
        const elementIsInsideContent = ($element.parents('.' + SCROLLABLE_CLASS).length - $element.parents('.' + SCROLLABLE_CONTENT_CLASS).length) === 0;
        if(!elementInsideContent || !elementIsInsideContent) {
            return;
        }

        const scrollPosition = { top: 0, left: 0 };
        const direction = this.option('direction');

        if(direction !== VERTICAL) {
            const leftPosition = this._elementPositionRelativeToContent($element, 'left');
            scrollPosition.left = this.option('rtlEnabled') === true
                ? leftPosition + $element.width() - this.clientWidth()
                : leftPosition;
        }
        if(direction !== HORIZONTAL) {
            scrollPosition.top = this._elementPositionRelativeToContent($element, 'top');
        }

        this.scrollTo(scrollPosition);
    },

    getScrollElementPosition: function($element, direction, offset) {
    //     offset = offset || {};
    //     const isVertical = direction === VERTICAL;
    //     const startOffset = (isVertical ? offset.top : offset.left) || 0;
    //     const endOffset = (isVertical ? offset.bottom : offset.right) || 0;
        // eslint-disable-next-line no-undef
        const pushBackOffset = isVertical ? this._strategy.verticalOffset() : 0;
        //     const elementPositionRelativeToContent = this._elementPositionRelativeToContent($element, isVertical ? 'top' : 'left');
        // eslint-disable-next-line no-unused-vars
        const elementPosition = /* elementPositionRelativeToContent */ -pushBackOffset;
        //     const elementSize = $element[isVertical ? 'outerHeight' : 'outerWidth']();
        //     const scrollLocation = (isVertical ? this.scrollTop() : this.scrollLeft());
        //     const clientSize = this._container().get(0)[isVertical ? 'clientHeight' : 'clientWidth'];

        //     const startDistance = scrollLocation - elementPosition + startOffset;
        //     const endDistance = scrollLocation - elementPosition - elementSize + clientSize - endOffset;

        //     if(startDistance <= 0 && endDistance >= 0) {
        //         return scrollLocation;
        //     }

    //     return scrollLocation - (Math.abs(startDistance) > Math.abs(endDistance) ? endDistance : startDistance);
    },

    _elementPositionRelativeToContent: function($element, prop) {
        let result = 0;
        while(this._hasScrollContent($element)) {
            result += $element.position()[prop];
            $element = $element.offsetParent();
        }
        return result;
    },

    _hasScrollContent: function($element) {
        const $content = this.$content();
        return $element.closest($content).length && !$element.is($content);
    },

    _updateIfNeed: function() {
        if(!this.option('updateManually')) {
            this.update();
        }
    },

    _useTemplates: function() {
        return false;
    },
});

registerComponent(SCROLLABLE, Scrollable);

export default Scrollable;
