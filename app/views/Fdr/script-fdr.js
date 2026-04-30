$(document).on("click", "#deleteDocument", function (event) {
  const modalCloseBtn = document.querySelector("#closeModal");
  event.preventDefault();
  $(`#modalAction`).addClass("disable");
  $.ajax({
    type: "DELETE",
    url: "/fdr/delete-fdr",
    data: {
      docIdToDelete: docIdToDelete,
      bank_id: bankID,
    },
    success: function (response) {
      if (response.status == 1) {
        NioApp.Toast(
          "<h5>Deleted Successfully</h5><p>Document deleted successfully!</p>",
          "success"
        );
        modalCloseBtn.click();
        fetchAllfdrs();
        $(`#modalAction`).removeClass("disable");
      } else {
        NioApp.Toast(
          `<h5>Something Went Wrong</h5>${
            response.msg || `<p>Error while Document deleted</p>`
          }`,
          "error"
        );
        modalCloseBtn.click();
        $(`#modalAction`).removeClass("disable");
      }
    },

    error: function (xhr, status, error) {
      NioApp.Toast(
        `<h5>Something Went Wrong</h5>${
          response.msg || `<p>Error while Document deleted</p>`
        }`,
        "error"
      );
      modalCloseBtn.click();
      $(`#modalAction`).removeClass("disable");
    },
  });
});

$(document).on("click", "#deleteDoc", function (event) {
  event.preventDefault();
  let openModal = document.getElementById("open-modal");

  docIdToDelete = $(this).data("id"); // Using .data() to get 'data-id'
  bankID = $(this).data("bank_id");

  if (docIdToDelete) {
    openModal.click();
  }
});

$(".filter-limit a").click(function (event) {
  event.preventDefault();
  const selectedLimit = $(this).data("limit");
  filters.limit = selectedLimit;
  $(".filter-limit li").removeClass("active");
  $(this).parent().addClass("active");
  fetchAllfdrs();
});

function rendersummaryRow(data) {
  const rowSummary = data.aggregatedAmountRow[0];

  const rowHTML = `
<div class="nk-tb-item text-left table-content rowSummary">
    <div class="nk-tb-col text-start editDocument">
    <b>TOTAL :</b>
    </div>
    <div class="nk-tb-col text-start">

    </div>
    <div class="nk-tb-col text-start">

    </div>
    <div class="nk-tb-col text-start">

    </div>
    <div class="nk-tb-col text-start">

    </div>
    <div class="nk-tb-col text-start">

    </div>
    <div class="nk-tb-col text-start">
    <b>${rowSummary?.total_deposit_amount || 0}</b>
    </div>
    <div class="nk-tb-col text-start">

    </div>
    <div class="nk-tb-col text-start">

    </div>
    <div class="nk-tb-col text-start">

    </div>
    <div class="nk-tb-col text-start">

    </div>
    <div class="nk-tb-col text-start">

    </div>
    <div class="nk-tb-col text-start">

    </div>
    <div class="nk-tb-col text-start">
     <b>${rowSummary?.total_renewal_amount || 0}</b>
    </div>
    <div class="nk-tb-col text-start">

    </div>
    <div class="nk-tb-col text-start">
    <b>${rowSummary?.total_maturity_amount || 0}</b>
    </div>
    <div class="nk-tb-col text-start">
    <b>${rowSummary?.total_interest || 0}</b>
    </div>
    <div class="nk-tb-col text-start">
    <b>${rowSummary?.total_tds || 0}</b>
    </div>
    <div class="nk-tb-col text-start">
    <b>${rowSummary?.total_margin_available || 0}</b>
    </div>
    <div class="nk-tb-col text-start">

    </div>
</div>`;
  $("#lastIndex").after(rowHTML);
}
