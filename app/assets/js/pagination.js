(function (global) {
  var ITEM_WIDTH_PX = 45;
  var ITEM_HEIGHT_PX = 38;
  var BUFFER_ITEMS = 10;

  function buildItemHTML(page, active) {
    var leftPx = (page - 1) * ITEM_WIDTH_PX;
    return (
      '<li class="paginate_button page-item' +
      (active ? " active" : "") +
      '" style="position:absolute;top:0;left:' +
      leftPx +
      "px;width:" +
      ITEM_WIDTH_PX +
      'px;margin:0;" data-page="' +
      page +
      '">' +
      '<a href="#" class="page-link" style="display:block;text-align:center;padding:6px 0;cursor:pointer;" tabindex="0">' +
      page +
      "</a>" +
      "</li>"
    );
  }

  function renderVisible(state) {
    if (!state.$scroll || !state.$track) return;
    var scrollLeft = state.$scroll.scrollLeft() || 0;
    var viewWidth = state.$scroll.width() || 0;
    if (viewWidth <= 0) return;

    var startIdx = Math.max(
      1,
      Math.floor(scrollLeft / ITEM_WIDTH_PX) - BUFFER_ITEMS + 1,
    );
    var endIdx = Math.min(
      state.totalPages,
      Math.ceil((scrollLeft + viewWidth) / ITEM_WIDTH_PX) + BUFFER_ITEMS,
    );

    var rangeKey = startIdx + ":" + endIdx + ":" + state.currentPage;
    if (rangeKey === state.lastRange) return;
    state.lastRange = rangeKey;

    var html = "";
    for (var i = startIdx; i <= endIdx; i++) {
      html += buildItemHTML(i, i === state.currentPage);
    }
    state.$track.html(html);
  }

  function findContainer(selector) {
    var $sel = $(selector);
    if (!$sel.length) return $();
    if ($sel.is("#table-pagination")) return $sel;
    var $closest = $sel.closest("#table-pagination");
    if ($closest.length) return $closest;
    return $("#table-pagination").first();
  }

  function renderPagination(opts) {
    var $container = findContainer(opts.selector);
    if (!$container.length) return;

    var totalPages = Math.max(0, parseInt(opts.totalPages, 10) || 0);
    var currentPage = Math.max(1, parseInt(opts.currentPage, 10) || 1);
    if (totalPages > 0 && currentPage > totalPages) currentPage = totalPages;

    $container.off("click").off("click.pagination").empty().css({
      display: "flex",
      "align-items": "center",
      "flex-wrap": "nowrap",
      gap: "6px",
      padding: "8px 12px",
    });

    var arrowStyle =
      "flex:0 0 auto;width:36px;height:36px;padding:0;font-size:20px;line-height:1;display:flex;align-items:center;justify-content:center;";

    var $prev = $(
      '<button type="button" class="btn btn-light btn-sm pgn-scroll-left" aria-label="Scroll left" style="' +
        arrowStyle +
        '">&#8249;</button>',
    );

    var $scroll = $(
      '<div class="pgn-scroll" style="flex:1 1 auto;overflow-x:auto;overflow-y:hidden;min-width:0;height:' +
        (ITEM_HEIGHT_PX + 8) +
        'px;"></div>',
    );

    var trackWidth = Math.max(0, totalPages) * ITEM_WIDTH_PX;
    var $track = $(
      '<ul class="pagination" style="position:relative;display:block;height:' +
        ITEM_HEIGHT_PX +
        "px;margin:0;padding:0;list-style:none;width:" +
        trackWidth +
        'px;"></ul>',
    );
    $scroll.append($track);

    var $next = $(
      '<button type="button" class="btn btn-light btn-sm pgn-scroll-right" aria-label="Scroll right" style="' +
        arrowStyle +
        '">&#8250;</button>',
    );

    $container.append($prev).append($scroll).append($next);

    var state = {
      $container: $container,
      $scroll: $scroll,
      $track: $track,
      totalPages: totalPages,
      currentPage: currentPage,
      onPageChange: opts.onPageChange,
      lastRange: "",
    };
    $container.data("paginationState", state);

    if (totalPages > 0) {
      var viewportWidth = $scroll.width() || $container.width() || 800;
      var centerLeft =
        (currentPage - 1) * ITEM_WIDTH_PX -
        viewportWidth / 2 +
        ITEM_WIDTH_PX / 2;
      var maxScroll = Math.max(0, trackWidth - viewportWidth);
      $scroll.scrollLeft(Math.max(0, Math.min(maxScroll, centerLeft)));
    }

    renderVisible(state);

    var rafId = null;
    $scroll.on("scroll.pagination", function () {
      if (rafId) return;
      rafId = (
        global.requestAnimationFrame ||
        function (cb) {
          return setTimeout(cb, 16);
        }
      )(function () {
        rafId = null;
        var s = $container.data("paginationState");
        if (s) renderVisible(s);
      });
    });

    $track.on("click.pagination", "li", function (e) {
      e.preventDefault();
      var s = $container.data("paginationState");
      if (!s) return;
      var page = parseInt($(this).attr("data-page"), 10);
      if (
        !isNaN(page) &&
        page !== s.currentPage &&
        typeof s.onPageChange === "function"
      ) {
        s.onPageChange(page);
      }
    });

    function updateArrowState() {
      var s = $container.data("paginationState");
      if (!s) return;
      var maxScroll = Math.max(
        0,
        s.$track.outerWidth() - s.$scroll.width(),
      );
      var current = s.$scroll.scrollLeft() || 0;
      $prev.prop("disabled", current <= 0);
      $next.prop("disabled", current >= maxScroll - 1);
    }

    function scrollByViewport(direction) {
      var s = $container.data("paginationState");
      if (!s) return;
      var step = Math.max(ITEM_WIDTH_PX * 5, s.$scroll.width() * 0.85);
      var target = (s.$scroll.scrollLeft() || 0) + direction * step;
      s.$scroll.stop(true).animate({ scrollLeft: target }, 200);
    }

    $prev.on("click.pagination", function () {
      scrollByViewport(-1);
    });
    $next.on("click.pagination", function () {
      scrollByViewport(1);
    });

    $scroll.on("scroll.pagination-arrows", updateArrowState);
    updateArrowState();
  }

  var resizeTimer = null;
  $(function () {
    $(window)
      .off("resize.paginationGlobal")
      .on("resize.paginationGlobal", function () {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          $("#table-pagination").each(function () {
            var s = $(this).data("paginationState");
            if (!s) return;
            s.lastRange = "";
            renderVisible(s);
          });
        }, 150);
      });
  });

  global.renderPagination = renderPagination;
})(window);
